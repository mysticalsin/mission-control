import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { selfHealingEngine } from '@/lib/self-healing'

/**
 * GET /api/health
 * Returns current health status of all systems, circuit breaker states,
 * and recent recovery logs.
 *
 * Requires admin role for full details; unauthenticated gets basic status.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')

  // Unauthenticated callers get a minimal liveness probe
  if ('error' in auth) {
    return buildLivenessResponse()
  }

  try {
    const summary = selfHealingEngine.getHealthSummary()

    return NextResponse.json({
      status: summary.overall,
      services: summary.services,
      circuitBreakers: summary.circuitBreakers,
      recentRecoveries: summary.recentRecoveries,
      degradedServices: summary.degradedServices,
      timestamp: summary.timestamp,
    })
  } catch (error) {
    logger.error({ err: error }, 'Health API GET error')
    return NextResponse.json(
      { error: 'Failed to retrieve health status' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/health
 * Trigger a manual health check or recovery action.
 *
 * Body:
 *   { "action": "check" }                          - Run all health checks
 *   { "action": "recover", "service": "database" } - Trigger recovery for a service
 *   { "action": "reset_circuit", "service": "db" } - Reset a circuit breaker
 *   { "action": "prune", "maxAgeSeconds": 86400 }  - Prune old health records
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await parseRequestBody(request)
    if (!body) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const { action } = body

    if (action === 'check') {
      return handleCheckAction()
    }

    if (action === 'recover') {
      return handleRecoverAction(body)
    }

    if (action === 'reset_circuit') {
      return handleResetCircuitAction(body)
    }

    if (action === 'prune') {
      return handlePruneAction(body)
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}. Valid actions: check, recover, reset_circuit, prune` },
      { status: 400 }
    )
  } catch (error) {
    logger.error({ err: error }, 'Health API POST error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function parseRequestBody(
  request: NextRequest
): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return null
    }
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

function handleCheckAction(): NextResponse {
  const results = selfHealingEngine.checkHealth()
  return NextResponse.json({
    action: 'check',
    results,
    timestamp: Math.floor(Date.now() / 1000),
  })
}

function handleRecoverAction(
  body: Record<string, unknown>
): NextResponse {
  const service = typeof body.service === 'string' ? body.service : ''
  if (!service) {
    return NextResponse.json(
      { error: 'Missing required field: service' },
      { status: 400 }
    )
  }

  const recoveryAction = selfHealingEngine.recover(
    service,
    new Error(`Manual recovery triggered for ${service}`)
  )

  return NextResponse.json({
    action: 'recover',
    recovery: recoveryAction,
    timestamp: Math.floor(Date.now() / 1000),
  })
}

function handleResetCircuitAction(
  body: Record<string, unknown>
): NextResponse {
  const service = typeof body.service === 'string' ? body.service : ''
  if (!service) {
    return NextResponse.json(
      { error: 'Missing required field: service' },
      { status: 400 }
    )
  }

  selfHealingEngine.resetCircuit(service)
  const states = selfHealingEngine.getCircuitStates()

  return NextResponse.json({
    action: 'reset_circuit',
    service,
    circuitBreakers: states,
    timestamp: Math.floor(Date.now() / 1000),
  })
}

function handlePruneAction(
  body: Record<string, unknown>
): NextResponse {
  const maxAge = typeof body.maxAgeSeconds === 'number'
    ? body.maxAgeSeconds
    : 86_400

  const pruned = selfHealingEngine.pruneOldChecks(maxAge)

  return NextResponse.json({
    action: 'prune',
    prunedRecords: pruned,
    maxAgeSeconds: maxAge,
    timestamp: Math.floor(Date.now() / 1000),
  })
}

function buildLivenessResponse(): NextResponse {
  try {
    const summary = selfHealingEngine.getHealthSummary()
    return NextResponse.json({
      status: summary.overall,
      timestamp: summary.timestamp,
    })
  } catch {
    return NextResponse.json(
      { status: 'down', timestamp: Math.floor(Date.now() / 1000) },
      { status: 503 }
    )
  }
}
