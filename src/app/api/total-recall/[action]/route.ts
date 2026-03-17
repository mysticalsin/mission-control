import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { proxyToJarvis, CircuitOpenError } from '@/lib/jarvis-proxy'

const ALLOWED_ACTIONS = new Set(['search', 'log', 'recent'])

// ── Route params type ────────────────────────────────────────────────────────

interface RouteParams {
  params: Promise<{ action: string }>
}

// ── GET /api/total-recall/[action] ───────────────────────────────────────────
// Supports: search, recent

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { action } = await params

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const path = `/api/recall/${action}${qs ? `?${qs}` : ''}`

  try {
    const res = await proxyToJarvis(path, { method: 'GET' }, request)
    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: 'Jarvis circuit is open — try again later' }, { status: 503 })
    }
    logger.error({ err, action }, 'Total Recall action GET proxy failed')
    return NextResponse.json({ error: 'Failed to reach Jarvis backend' }, { status: 502 })
  }
}

// ── POST /api/total-recall/[action] ──────────────────────────────────────────
// Supports: log (POST /api/recall/log)

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { action } = await params

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 404 })
  }

  try {
    const body = await request.text()
    const res = await proxyToJarvis(`/api/recall/${action}`, { method: 'POST', body }, request)
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: 'Jarvis circuit is open — try again later' }, { status: 503 })
    }
    logger.error({ err, action }, 'Total Recall action POST proxy failed')
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export const dynamic = 'force-dynamic'
