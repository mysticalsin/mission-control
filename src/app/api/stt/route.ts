import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 60_000

// ---------------------------------------------------------------------------
// GET /api/stt — proxy to Jarvis /api/stt/history
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const limit = req.nextUrl.searchParams.get('limit') ?? '20'
    const upstream = `${JARVIS_BASE}/api/stt/history?limit=${encodeURIComponent(limit)}`

    const res = await fetch(upstream, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })

    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, 'STT history proxy failed')
    return NextResponse.json(
      { ok: false, error: `Jarvis STT unreachable: ${message}` },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/stt — proxy file upload to Jarvis /api/stt/transcribe
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData()

    const upstream = `${JARVIS_BASE}/api/stt/transcribe`
    const res = await fetch(upstream, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, 'STT transcribe proxy failed')
    return NextResponse.json(
      { ok: false, error: `Jarvis STT unreachable: ${message}` },
      { status: 502 },
    )
  }
}
