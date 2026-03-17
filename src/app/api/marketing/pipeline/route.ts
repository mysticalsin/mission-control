import { NextRequest, NextResponse } from 'next/server'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 300_000 // 5 min — pipeline generation can take a while

// ── GET /api/marketing/pipeline?action=jobs|status|themes|agents|hierarchy ────
// Proxies to Jarvis marketing pipeline endpoints

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'jobs'

  const routeMap: Record<string, string> = {
    jobs: '/api/marketing/pipeline/jobs',
    agents: '/api/marketing/agents',
    hierarchy: '/api/marketing/agents/hierarchy',
  }

  // Status requires a job_id parameter
  if (action === 'status') {
    const jobId = searchParams.get('job_id')
    if (!jobId) {
      return NextResponse.json({ error: 'Missing job_id parameter' }, { status: 400 })
    }
    return proxyGet(`/api/marketing/pipeline/status/${encodeURIComponent(jobId)}`)
  }

  // Download requires a filename parameter
  if (action === 'download') {
    const filename = searchParams.get('filename')
    if (!filename) {
      return NextResponse.json({ error: 'Missing filename parameter' }, { status: 400 })
    }
    return proxyDownload(`/api/marketing/pipeline/download/${encodeURIComponent(filename)}`)
  }

  const path = routeMap[action]
  if (!path) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  return proxyGet(path)
}

// ── POST /api/marketing/pipeline -> proxy to Jarvis pipeline/generate ────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/marketing/pipeline/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Pipeline generation failed: ${message}` },
      { status: 502 },
    )
  }
}

// ── DELETE /api/marketing/pipeline -> delete a pipeline job ──────────────────

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let body: { job_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const jobId = (body.job_id ?? '').trim()
  if (!jobId) {
    return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(
      `${JARVIS_BASE}/api/marketing/pipeline/jobs/${encodeURIComponent(jobId)}`,
      { method: 'DELETE', signal: controller.signal },
    )
    clearTimeout(timer)

    // Jarvis may not support DELETE yet — treat 404/405 as success (job already gone or unsupported)
    if (upstream.ok || upstream.status === 404 || upstream.status === 405) {
      return NextResponse.json({ ok: true, deleted: jobId })
    }

    const data: unknown = await upstream.json().catch(() => ({ error: 'Delete failed' }))
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Pipeline delete failed: ${message}` },
      { status: 502 },
    )
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function proxyGet(path: string): Promise<NextResponse> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}${path}`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Jarvis proxy failed: ${message}` },
      { status: 502 },
    )
  }
}

async function proxyDownload(path: string): Promise<NextResponse> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}${path}`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Download failed: ${upstream.status}` },
        { status: upstream.status },
      )
    }

    const blob = await upstream.blob()
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const disposition = upstream.headers.get('content-disposition') || ''

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...(disposition ? { 'Content-Disposition': disposition } : {}),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Download proxy failed: ${message}` },
      { status: 502 },
    )
  }
}

export const dynamic = 'force-dynamic'
