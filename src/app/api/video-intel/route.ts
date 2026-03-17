import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { proxyToJarvis, CircuitOpenError } from '@/lib/jarvis-proxy'

export const dynamic = 'force-dynamic'

const VIDEO_TIMEOUT_MS = 120_000

const log = logger.child({ module: 'api/video-intel' })

// ---------------------------------------------------------------------------
// GET /api/video-intel
// Proxies to Jarvis /api/v2/video/dashboard by default
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const path = `/api/v2/video/dashboard${qs ? `?${qs}` : ''}`

  log.info({ path }, 'Proxying GET to Jarvis')

  try {
    const res = await proxyToJarvis(path, { method: 'GET' }, request, VIDEO_TIMEOUT_MS)
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
    log.error({ error: message, path }, 'Jarvis proxy GET error')
    return NextResponse.json(
      { error: 'Video intel service unavailable', detail: message },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/video-intel
// Proxies to Jarvis /api/v2/video/streams (create stream)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  log.info('Proxying POST to Jarvis (create stream)')

  try {
    const body: unknown = await request.json()
    const res = await proxyToJarvis(
      '/api/v2/video/streams',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      request,
      VIDEO_TIMEOUT_MS,
    )

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
    log.error({ error: message }, 'Jarvis proxy POST error')
    return NextResponse.json(
      { error: 'Video intel service unavailable', detail: message },
      { status: 502 },
    )
  }
}
