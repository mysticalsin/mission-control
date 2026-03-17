import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 30_000

// Whitelist of allowed sub-actions to prevent arbitrary path traversal
const ALLOWED_GET_ACTIONS = new Set([
  'decisions',
  'decisions-stats',
  'decisions-timeline',
  'permissions-check',
  'permissions-matrix',
  'permissions-policies',
  'replay-stats',
  'replay-log',
])

const ALLOWED_POST_ACTIONS = new Set([
  'decisions',
  'grant-permission',
  'apply-policy',
  'create-policy',
  'replay-log',
  'replay-call',
])

// Maps panel-friendly action names to Jarvis upstream paths
function resolveGetPath(action: string, params: URLSearchParams): string | null {
  switch (action) {
    case 'decisions':
      return '/api/v2/omega/decisions'
    case 'decisions-stats':
      return '/api/v2/omega/decisions/stats'
    case 'decisions-timeline':
      return '/api/v2/omega/decisions/timeline'
    case 'permissions-check':
      return '/api/v2/omega/permissions/check'
    case 'permissions-matrix':
      return '/api/v2/omega/permissions/matrix'
    case 'permissions-policies':
      return '/api/v2/omega/permissions/policies'
    case 'replay-stats':
      return '/api/v2/omega/replay/cache-stats'
    case 'replay-log': {
      const agentId = params.get('agent_id')
      if (agentId) return `/api/v2/omega/replay/agent/${encodeURIComponent(agentId)}`
      return '/api/v2/omega/replay/log'
    }
    default:
      return null
  }
}

function resolvePostPath(
  action: string,
  body: Record<string, unknown>,
): string | null {
  switch (action) {
    case 'decisions':
      return '/api/v2/omega/decisions'
    case 'grant-permission': {
      const agentId = body.agent_id
      if (typeof agentId !== 'string') return null
      return `/api/v2/omega/permissions/agent/${encodeURIComponent(agentId)}`
    }
    case 'apply-policy': {
      const agentId = body.agent_id
      const policyId = body.policy_id
      if (typeof agentId !== 'string' || typeof policyId !== 'string') return null
      return `/api/v2/omega/permissions/agent/${encodeURIComponent(agentId)}/apply-policy/${encodeURIComponent(policyId)}`
    }
    case 'create-policy':
      return '/api/v2/omega/permissions/policies'
    case 'replay-log':
      return '/api/v2/omega/replay/log'
    case 'replay-call': {
      const callId = body.call_id
      if (typeof callId !== 'string') return null
      return `/api/v2/omega/replay/${encodeURIComponent(callId)}/replay`
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// GET /api/omega/[action] — proxy to Jarvis Omega sub-endpoints
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  const rateLimited = readLimiter(req)
  if (rateLimited) return rateLimited

  const auth = requireRole(req, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!ALLOWED_GET_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `Unknown Omega action: ${action}` },
      { status: 404 },
    )
  }

  try {
    const searchParams = req.nextUrl.searchParams
    const upstreamPath = resolveGetPath(action, searchParams)
    if (!upstreamPath) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    // Forward query params (excluding 'agent_id' when it was consumed by path)
    const forwardParams = new URLSearchParams()
    searchParams.forEach((value, key) => {
      if (action === 'replay-log' && key === 'agent_id') return
      forwardParams.set(key, value)
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
    logger.error({ err }, `Omega ${action} GET proxy failed`)
    return NextResponse.json(
      { error: `Jarvis Omega unreachable: ${message}` },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/omega/[action] — proxy POST to Jarvis Omega sub-endpoints
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  const rateLimited = mutationLimiter(req)
  if (rateLimited) return rateLimited

  const auth = requireRole(req, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!ALLOWED_POST_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `Unknown Omega action: ${action}` },
      { status: 404 },
    )
  }

  try {
    const payload = await req.json() as Record<string, unknown>
    const upstreamPath = resolvePostPath(action, payload)
    if (!upstreamPath) {
      return NextResponse.json({ error: 'Invalid parameters for action' }, { status: 400 })
    }

    const upstream = `${JARVIS_BASE}${upstreamPath}`

    const res = await fetch(upstream, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const body: unknown = await res.json()
    return NextResponse.json(body, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, `Omega ${action} POST proxy failed`)
    return NextResponse.json(
      { error: `Jarvis Omega unreachable: ${message}` },
      { status: 502 },
    )
  }
}
