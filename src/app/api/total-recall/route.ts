import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { proxyToJarvis, CircuitOpenError } from '@/lib/jarvis-proxy'

// ── GET /api/total-recall ────────────────────────────────────────────────────
// Proxies to GET /api/recall/recent on Jarvis

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const hours = searchParams.get('hours') ?? '24'
  const limit = searchParams.get('limit') ?? '50'

  try {
    const res = await proxyToJarvis(
      `/api/recall/recent?hours=${hours}&limit=${limit}`,
      { method: 'GET' }, request,
    )
    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: 'Jarvis circuit is open — try again later' }, { status: 503 })
    }
    logger.error({ err }, 'Total Recall GET proxy failed')
    return NextResponse.json({ error: 'Failed to reach Jarvis backend' }, { status: 502 })
  }
}

// ── POST /api/total-recall ───────────────────────────────────────────────────
// Proxies to POST /api/recall on Jarvis (recall by query or recent)

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.text()
    const res = await proxyToJarvis('/api/recall', { method: 'POST', body }, request)
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: 'Jarvis circuit is open — try again later' }, { status: 503 })
    }
    logger.error({ err }, 'Total Recall POST proxy failed')
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export const dynamic = 'force-dynamic'
