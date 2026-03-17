import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { proxyToJarvis, CircuitOpenError } from '@/lib/jarvis-proxy'

export const dynamic = 'force-dynamic'

const VIDEO_TIMEOUT_MS = 120_000

const log = logger.child({ module: 'api/video-intel/[action]' })

// Map panel action slugs to Jarvis backend paths
const ACTION_MAP: Readonly<Record<string, string>> = {
  dashboard: '/api/v2/video/dashboard',
  streams: '/api/v2/video/streams',
  events: '/api/v2/video/events',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveJarvisPath(action: string, search?: string): string | null {
  const path = ACTION_MAP[action]
  if (!path) return null
  return search ? `${path}?${search}` : path
}

async function proxyVideoIntel(
  path: string,
  method: string,
  request: NextRequest,
  body?: unknown,
): Promise<NextResponse> {
  try {
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }

    const res = await proxyToJarvis(path, init, request, VIDEO_TIMEOUT_MS)
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json(
        { error: 'Jarvis circuit is open — try again later' },
        { status: 503 },
      )
    }
    const message = err instanceof Error ? err.message : 'Proxy request failed'
    log.error({ error: message, path, method }, 'Jarvis proxy error')
    return NextResponse.json(
      { error: 'Video intel service unavailable', detail: message },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// GET /api/video-intel/[action]
// Proxies: dashboard, streams, events
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params
  const { searchParams } = new URL(request.url)
  const path = resolveJarvisPath(action, searchParams.toString())

  if (!path) {
    return NextResponse.json(
      { error: `Unknown video-intel action: ${action}` },
      { status: 404 },
    )
  }

  log.info({ action, path }, 'Proxying GET to Jarvis')
  return proxyVideoIntel(path, 'GET', request)
}

// ---------------------------------------------------------------------------
// POST /api/video-intel/[action]
// Proxies: streams (create), analyze (trigger analysis on a stream)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  // "analyze" triggers analysis on a specific stream
  if (action === 'analyze') {
    const payload = body as { stream_id?: number }
    if (!payload.stream_id || typeof payload.stream_id !== 'number') {
      return NextResponse.json(
        { error: 'stream_id (number) is required' },
        { status: 400 },
      )
    }
    const path = `/api/v2/video/streams/${payload.stream_id}/analyze`
    log.info({ path, streamId: payload.stream_id }, 'Proxying analyze to Jarvis')
    return proxyVideoIntel(path, 'POST', request, body)
  }

  // "streams" creates a new stream
  if (action === 'streams') {
    log.info('Proxying create stream to Jarvis')
    return proxyVideoIntel('/api/v2/video/streams', 'POST', request, body)
  }

  // "events" creates a manual event
  if (action === 'events') {
    log.info('Proxying create event to Jarvis')
    return proxyVideoIntel('/api/v2/video/events', 'POST', request, body)
  }

  return NextResponse.json(
    { error: `Unknown video-intel action: ${action}` },
    { status: 404 },
  )
}
