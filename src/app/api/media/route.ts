import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 60_000

// ---------------------------------------------------------------------------
// GET /api/media -> proxy to Jarvis GET /api/media/videos
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const upstream = `${JARVIS_BASE}/api/media/videos`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(upstream, { signal: controller.signal })
    clearTimeout(timer)

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown upstream error')
      logger.error({ upstream, status: res.status }, 'Jarvis media list failed')
      return NextResponse.json(
        { error: 'Failed to fetch media library', detail: text },
        { status: res.status },
      )
    }

    const data: unknown = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err: msg }, 'Media GET proxy error')

    if (msg.includes('abort')) {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/media -> proxy to Jarvis POST /api/media/video
// Accepts JSON body with video generation params
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await req.json()
    const upstream = `${JARVIS_BASE}/api/media/video`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown upstream error')
      logger.error({ upstream, status: res.status }, 'Jarvis media create failed')
      return NextResponse.json(
        { error: 'Failed to create video job', detail: text },
        { status: res.status },
      )
    }

    const data: unknown = await res.json()
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err: msg }, 'Media POST proxy error')

    if (msg.includes('abort')) {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
