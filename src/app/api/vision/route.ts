import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const PROXY_TIMEOUT_MS = 60_000

// ---------------------------------------------------------------------------
// GET /api/vision -- list transcription jobs
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = readLimiter(req)
  if (limited) return limited

  try {
    const url = new URL(req.url)
    const limit = url.searchParams.get('limit') ?? '20'
    const offset = url.searchParams.get('offset') ?? '0'
    const status = url.searchParams.get('status')

    const params = new URLSearchParams({ limit, offset })
    if (status) params.set('status', status)

    const upstream = await fetch(
      `${JARVIS_BASE}/api/vision/transcriptions?${params.toString()}`,
      { signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) },
    )

    if (!upstream.ok) {
      logger.warn({ status: upstream.status }, 'Jarvis vision list failed')
      return NextResponse.json(
        { error: 'Upstream vision service unavailable' },
        { status: upstream.status },
      )
    }

    const data: unknown = await upstream.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ error: message }, 'Vision GET proxy error')
    return NextResponse.json(
      { error: 'Failed to fetch transcription jobs' },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/vision -- upload file for transcription (multipart proxy)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = mutationLimiter(req)
  if (limited) return limited

  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type must be multipart/form-data' },
        { status: 400 },
      )
    }

    // Forward the raw body as-is to preserve multipart boundaries
    const body = await req.arrayBuffer()

    const upstream = await fetch(`${JARVIS_BASE}/api/vision/transcribe`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    })

    if (!upstream.ok) {
      const errBody = await upstream.text()
      logger.warn({ status: upstream.status, body: errBody }, 'Jarvis transcribe failed')
      return NextResponse.json(
        { error: errBody || 'Transcription upload failed' },
        { status: upstream.status },
      )
    }

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ error: message }, 'Vision POST proxy error')
    return NextResponse.json(
      { error: 'Failed to upload for transcription' },
      { status: 502 },
    )
  }
}
