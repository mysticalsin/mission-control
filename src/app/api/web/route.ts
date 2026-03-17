import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { proxyToJarvis, CircuitOpenError } from '@/lib/jarvis-proxy'

const WEB_TIMEOUT_MS = 30_000

// ── GET /api/web ─────────────────────────────────────────────────────────────
// Proxies to GET /api/web/engines on Jarvis (engine status overview)

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const res = await proxyToJarvis(
      '/api/web/engines', { method: 'GET' }, request, WEB_TIMEOUT_MS,
    )
    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: 'Jarvis circuit is open — try again later' }, { status: 503 })
    }
    logger.error({ err }, 'Web GET proxy failed')
    return NextResponse.json({ error: 'Failed to reach Jarvis backend' }, { status: 502 })
  }
}

// ── POST /api/web ────────────────────────────────────────────────────────────
// Proxies to POST /api/web/crawl on Jarvis (fetch URL content)

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.text()
    const res = await proxyToJarvis(
      '/api/web/crawl', { method: 'POST', body }, request, WEB_TIMEOUT_MS,
    )
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: 'Jarvis circuit is open — try again later' }, { status: 503 })
    }
    logger.error({ err }, 'Web POST proxy failed')
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export const dynamic = 'force-dynamic'
