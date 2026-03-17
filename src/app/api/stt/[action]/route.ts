import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 60_000

// Whitelist of allowed sub-actions to prevent arbitrary path traversal
const ALLOWED_ACTIONS = new Set([
  'health',
  'history',
  'transcribe',
  'transcribe-url',
])

// ---------------------------------------------------------------------------
// GET /api/stt/[action] — proxy to Jarvis /api/stt/<action>
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      { ok: false, error: `Unknown STT action: ${action}` },
      { status: 404 },
    )
  }

  try {
    const search = req.nextUrl.searchParams.toString()
    const qs = search ? `?${search}` : ''
    const upstream = `${JARVIS_BASE}/api/stt/${action}${qs}`

    const res = await fetch(upstream, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })

    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, `STT ${action} proxy failed`)
    return NextResponse.json(
      { ok: false, error: `Jarvis STT unreachable: ${message}` },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/stt/[action] — proxy POST requests (transcribe, transcribe-url)
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      { ok: false, error: `Unknown STT action: ${action}` },
      { status: 404 },
    )
  }

  try {
    const contentType = req.headers.get('content-type') ?? ''
    const upstream = `${JARVIS_BASE}/api/stt/${action}`

    // Forward as FormData for multipart, otherwise as JSON
    let body: BodyInit
    const headers: Record<string, string> = {}

    if (contentType.includes('multipart/form-data')) {
      body = await req.formData()
    } else {
      body = await req.text()
      headers['Content-Type'] = contentType || 'application/json'
    }

    const res = await fetch(upstream, {
      method: 'POST',
      body,
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const responseBody: unknown = await res.json()
    return NextResponse.json(responseBody, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, `STT ${action} POST proxy failed`)
    return NextResponse.json(
      { ok: false, error: `Jarvis STT unreachable: ${message}` },
      { status: 502 },
    )
  }
}
