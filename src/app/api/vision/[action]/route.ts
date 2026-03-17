import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const PROXY_TIMEOUT_MS = 60_000

// Allowlist of valid sub-route actions to prevent open-proxy abuse
const VALID_ACTIONS = new Set(['jobs', 'analyze', 'health', 'stats'])

type RouteContext = { params: Promise<{ action: string }> }

// ---------------------------------------------------------------------------
// GET /api/vision/[action]
//   - /api/vision/jobs?id=xxx   -> GET /api/vision/transcription/:id
//   - /api/vision/health        -> GET /api/vision/health
//   - /api/vision/stats         -> GET /api/vision/stats
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const auth = requireRole(req, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = readLimiter(req)
  if (limited) return limited

  const { action } = await context.params

  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 404 })
  }

  try {
    let upstreamUrl: string

    if (action === 'jobs') {
      const url = new URL(req.url)
      const jobId = url.searchParams.get('id')
      if (!jobId || !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
        return NextResponse.json(
          { error: 'Missing or invalid job id parameter' },
          { status: 400 },
        )
      }
      upstreamUrl = `${JARVIS_BASE}/api/vision/transcription/${jobId}`
    } else if (action === 'health') {
      upstreamUrl = `${JARVIS_BASE}/api/vision/health`
    } else {
      upstreamUrl = `${JARVIS_BASE}/api/vision/stats`
    }

    const upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    })

    if (!upstream.ok) {
      logger.warn(
        { action, status: upstream.status },
        'Jarvis vision sub-route GET failed',
      )
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status },
      )
    }

    const data: unknown = await upstream.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ action, error: message }, 'Vision sub-route GET error')
    return NextResponse.json(
      { error: 'Failed to reach vision service' },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/vision/[action]
//   - /api/vision/analyze  -> POST multipart to Jarvis vision analyze endpoint
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const auth = requireRole(req, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = mutationLimiter(req)
  if (limited) return limited

  const { action } = await context.params

  if (action !== 'analyze') {
    return NextResponse.json(
      { error: 'POST not supported for this action' },
      { status: 405 },
    )
  }

  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type must be multipart/form-data' },
        { status: 400 },
      )
    }

    const body = await req.arrayBuffer()

    const upstream = await fetch(`${JARVIS_BASE}/api/vision/analyze`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    })

    if (!upstream.ok) {
      const errText = await upstream.text()
      logger.warn(
        { status: upstream.status, body: errText },
        'Jarvis vision analyze failed',
      )
      return NextResponse.json(
        { error: errText || 'Vision analysis failed' },
        { status: upstream.status },
      )
    }

    const data: unknown = await upstream.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ error: message }, 'Vision analyze proxy error')
    return NextResponse.json(
      { error: 'Failed to analyze image' },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/vision/[action]
//   - /api/vision/jobs?id=xxx  -> DELETE /api/vision/transcription/:id
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const auth = requireRole(req, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = mutationLimiter(req)
  if (limited) return limited

  const { action } = await context.params

  if (action !== 'jobs') {
    return NextResponse.json(
      { error: 'DELETE not supported for this action' },
      { status: 405 },
    )
  }

  try {
    const url = new URL(req.url)
    const jobId = url.searchParams.get('id')
    if (!jobId || !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      return NextResponse.json(
        { error: 'Missing or invalid job id parameter' },
        { status: 400 },
      )
    }

    const upstream = await fetch(
      `${JARVIS_BASE}/api/vision/transcription/${jobId}`,
      { method: 'DELETE', signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) },
    )

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status },
      )
    }

    const data: unknown = await upstream.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ error: message }, 'Vision delete proxy error')
    return NextResponse.json(
      { error: 'Failed to delete transcription job' },
      { status: 502 },
    )
  }
}
