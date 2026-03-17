import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// GET /api/omega — proxy to Jarvis Omega status or reports
// Query params:
//   ?tab=status   -> /api/v2/omega/status
//   ?tab=reports  -> /api/v2/omega/decisions/stats
//   ?tab=timeline -> /api/v2/omega/decisions/timeline
//   ?tab=replay   -> /api/v2/omega/replay/cache-stats
//   ?tab=policies -> /api/v2/omega/permissions/policies
//   ?tab=matrix   -> /api/v2/omega/permissions/matrix
// ---------------------------------------------------------------------------

const TAB_ROUTES: Readonly<Record<string, string>> = {
  status: '/api/v2/omega/status',
  reports: '/api/v2/omega/decisions/stats',
  timeline: '/api/v2/omega/decisions/timeline',
  replay: '/api/v2/omega/replay/cache-stats',
  policies: '/api/v2/omega/permissions/policies',
  matrix: '/api/v2/omega/permissions/matrix',
} as const

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') ?? 'status'
  const upstreamPath = TAB_ROUTES[tab]

  if (!upstreamPath) {
    return NextResponse.json(
      { error: `Invalid tab: ${tab}. Valid: ${Object.keys(TAB_ROUTES).join(', ')}` },
      { status: 400 },
    )
  }

  try {
    // Forward relevant query params (excluding 'tab') to Jarvis
    const forwardParams = new URLSearchParams()
    searchParams.forEach((value, key) => {
      if (key !== 'tab') forwardParams.set(key, value)
    })
    const qs = forwardParams.toString()
    const upstream = `${JARVIS_BASE}${upstreamPath}${qs ? `?${qs}` : ''}`

    const res = await fetch(upstream, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })

    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, `Omega GET (tab=${tab}) proxy failed`)
    return NextResponse.json(
      { error: `Jarvis Omega unreachable: ${message}` },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/omega — proxy to Jarvis Omega decision creation
// Body: { action: 'create_decision' | 'bootstrap_permissions', ...data }
// ---------------------------------------------------------------------------

const POST_ROUTES: Readonly<Record<string, string>> = {
  create_decision: '/api/v2/omega/decisions',
  bootstrap_permissions: '/api/v2/omega/permissions/bootstrap',
} as const

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const payload = await request.json() as Record<string, unknown>
    const action = typeof payload.action === 'string' ? payload.action : ''
    const upstreamPath = POST_ROUTES[action]

    if (!upstreamPath) {
      return NextResponse.json(
        { error: `Invalid action: ${action}. Valid: ${Object.keys(POST_ROUTES).join(', ')}` },
        { status: 400 },
      )
    }

    const upstream = `${JARVIS_BASE}${upstreamPath}`

    // Strip the 'action' field before forwarding — Jarvis doesn't expect it
    const { action: _removed, ...forwardBody } = payload

    const res = await fetch(upstream, {
      method: 'POST',
      body: JSON.stringify(forwardBody),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, 'Omega POST proxy failed')
    return NextResponse.json(
      { error: `Jarvis Omega unreachable: ${message}` },
      { status: 502 },
    )
  }
}
