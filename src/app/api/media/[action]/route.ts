import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 60_000

// ---------------------------------------------------------------------------
// Route map: action param -> Jarvis endpoint
// ---------------------------------------------------------------------------

type RouteParams = { params: Promise<{ action: string }> }

function buildUpstreamUrl(action: string, searchParams: URLSearchParams): string | null {
  switch (action) {
    case 'styles':
      return `${JARVIS_BASE}/api/media/video-styles`
    case 'detail': {
      const jobId = searchParams.get('jobId')
      if (!jobId) return null
      return `${JARVIS_BASE}/api/media/video/${encodeURIComponent(jobId)}`
    }
    case 'delete': {
      const jobId = searchParams.get('jobId')
      if (!jobId) return null
      return `${JARVIS_BASE}/api/media/video/${encodeURIComponent(jobId)}`
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// GET /api/media/[action]
// Handles: styles, detail?jobId=xxx
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { action } = await params
  const upstream = buildUpstreamUrl(action, req.nextUrl.searchParams)

  if (!upstream) {
    return NextResponse.json(
      { error: `Unknown media action: ${action}` },
      { status: 400 },
    )
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(upstream, { signal: controller.signal })
    clearTimeout(timer)

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown upstream error')
      logger.error({ upstream, status: res.status }, 'Jarvis media action failed')
      return NextResponse.json(
        { error: `Upstream error for ${action}`, detail: text },
        { status: res.status },
      )
    }

    const data: unknown = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err: msg, action }, 'Media action GET proxy error')

    if (msg.includes('abort')) {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/media/[action]
// Handles: delete?jobId=xxx
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { action } = await params

  if (action !== 'delete') {
    return NextResponse.json(
      { error: `DELETE not supported for action: ${action}` },
      { status: 405 },
    )
  }

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 })
  }

  const upstream = `${JARVIS_BASE}/api/media/video/${encodeURIComponent(jobId)}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(upstream, {
      method: 'DELETE',
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown upstream error')
      logger.error({ upstream, status: res.status }, 'Jarvis media delete failed')
      return NextResponse.json(
        { error: 'Failed to delete media file', detail: text },
        { status: res.status },
      )
    }

    const data: unknown = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err: msg }, 'Media DELETE proxy error')

    if (msg.includes('abort')) {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
