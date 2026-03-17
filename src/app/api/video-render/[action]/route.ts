import { NextRequest, NextResponse } from 'next/server'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 120_000

/**
 * Dynamic sub-routes for video-render:
 *   GET  /api/video-render/templates     -> /api/video/templates
 *   GET  /api/video-render/jobs          -> /api/video/jobs
 *   GET  /api/video-render/status/[id]   -> /api/video/render/[id]
 *   POST /api/video-render/prompt        -> /api/video/prompt
 *   DELETE /api/video-render/delete/[id] -> /api/video/jobs/[id]
 */

type RouteContext = { params: Promise<{ action: string }> }

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { action } = await context.params
  let upstreamPath: string

  if (action === 'templates') {
    upstreamPath = '/api/video/templates'
  } else if (action === 'jobs') {
    upstreamPath = '/api/video/jobs'
  } else if (action.startsWith('status')) {
    // Extract job ID from query params for status checks
    const jobId = request.nextUrl.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 })
    }
    upstreamPath = `/api/video/render/${encodeURIComponent(jobId)}`
  } else {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 404 })
  }

  try {
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
      { error: `Proxy request failed: ${message}` },
      { status: 502 },
    )
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { action } = await context.params

  if (action !== 'prompt') {
    return NextResponse.json({ error: `Unknown POST action: ${action}` }, { status: 404 })
  }

  try {
    const body: unknown = await request.json()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/video/prompt`, {
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
      { error: `Prompt request failed: ${message}` },
      { status: 502 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { action } = await context.params

  if (!action.startsWith('delete')) {
    return NextResponse.json({ error: `Unknown DELETE action: ${action}` }, { status: 404 })
  }

  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(
      `${JARVIS_BASE}/api/video/jobs/${encodeURIComponent(jobId)}`,
      { method: 'DELETE', signal: controller.signal },
    )
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Delete request failed: ${message}` },
      { status: 502 },
    )
  }
}
