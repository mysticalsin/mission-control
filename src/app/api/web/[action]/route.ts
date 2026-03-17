import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { proxyToJarvis, CircuitOpenError } from '@/lib/jarvis-proxy'

const WEB_TIMEOUT_MS = 30_000

// Allowlisted actions to prevent arbitrary path traversal
const ALLOWED_ACTIONS = new Set(['crawl', 'search', 'research', 'engines'])

// ── Route params type ────────────────────────────────────────────────────────

interface RouteParams {
  params: Promise<{ action: string }>
}

// ── GET /api/web/[action] ────────────────────────────────────────────────────
// Supports: engines

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
  const path = `/api/web/${action}${qs ? `?${qs}` : ''}`

  try {
    const res = await proxyToJarvis(path, { method: 'GET' }, request, WEB_TIMEOUT_MS)
    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: 'Jarvis circuit is open — try again later' }, { status: 503 })
    }
    logger.error({ err, action }, 'Web action GET proxy failed')
    return NextResponse.json({ error: 'Failed to reach Jarvis backend' }, { status: 502 })
  }
}

// ── POST /api/web/[action] ───────────────────────────────────────────────────
// Supports: crawl, search, research

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
    const res = await proxyToJarvis(
      `/api/web/${action}`, { method: 'POST', body }, request, WEB_TIMEOUT_MS,
    )
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return NextResponse.json({ error: 'Jarvis circuit is open — try again later' }, { status: 503 })
    }
    logger.error({ err, action }, 'Web action POST proxy failed')
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export const dynamic = 'force-dynamic'
