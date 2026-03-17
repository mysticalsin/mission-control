import { NextRequest, NextResponse } from 'next/server'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 60_000

// ── Allowed actions to prevent open-proxy abuse ──────────────────────────────

const ALLOWED_ACTIONS = new Set(['jobs', 'batch', 'health'])

// ── GET /api/scraping/[action] ───────────────────────────────────────────────
// Proxies to Jarvis endpoints:
//   /api/scraping/jobs?id=xyz  -> /api/scraping/jobs/{id}
//   /api/scraping/health       -> /api/scraping/health

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 404 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('id')

    // Route /api/scraping/jobs?id=xyz to Jarvis /api/scraping/jobs/{id}
    const upstreamPath =
      action === 'jobs' && jobId
        ? `/api/scraping/jobs/${encodeURIComponent(jobId)}`
        : `/api/scraping/${action}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}${upstreamPath}`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Scraping proxy error (${action}): ${message}` },
      { status: 502 },
    )
  }
}

// ── POST /api/scraping/[action] ──────────────────────────────────────────────
// Proxies to Jarvis:
//   /api/scraping/batch -> /api/scraping/batch

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 404 })
  }

  try {
    const body: unknown = await request.json()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/scraping/${action}`, {
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
      { error: `Scraping proxy error (${action}): ${message}` },
      { status: 502 },
    )
  }
}

// ── DELETE /api/scraping/[action] ────────────────────────────────────────────
// Proxies: /api/scraping/jobs?id=xyz -> DELETE /api/scraping/jobs/{id}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  if (action !== 'jobs') {
    return NextResponse.json({ error: 'DELETE only supported for jobs' }, { status: 405 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('id')

    if (!jobId) {
      return NextResponse.json({ error: 'Missing job id parameter' }, { status: 400 })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(
      `${JARVIS_BASE}/api/scraping/jobs/${encodeURIComponent(jobId)}`,
      { method: 'DELETE', signal: controller.signal },
    )
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to delete scraping job: ${message}` },
      { status: 502 },
    )
  }
}

export const dynamic = 'force-dynamic'
