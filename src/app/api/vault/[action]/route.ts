import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { proxyToJarvis, envelopeError, CircuitOpenError } from '@/lib/jarvis-proxy'

// Only allow known sub-actions to prevent open-redirect proxy abuse
const ALLOWED_ACTIONS = new Set(['status', 'rotate', 'delete', 'decrypt', 'replace'])

// ---------------------------------------------------------------------------
// Route parameter extraction
// ---------------------------------------------------------------------------

type RouteParams = { params: Promise<{ action: string }> }

function validateAction(action: string): string | null {
  const sanitised = action.toLowerCase().trim()
  if (!ALLOWED_ACTIONS.has(sanitised)) return null
  return sanitised
}

// ---------------------------------------------------------------------------
// GET /api/vault/[action] — status, decrypt
// ---------------------------------------------------------------------------

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

  const { action: rawAction } = await params
  const action = validateAction(rawAction)
  if (!action) {
    return envelopeError(`Unknown vault action: ${rawAction}`, 400)
  }

  try {
    const jarvisPath = resolveGetPath(action, request)
    const response = await proxyToJarvis(jarvisPath, { method: 'GET' }, request)
    const data: unknown = await response.json()

    if (!response.ok) {
      const detail = (data as Record<string, string>)?.detail ?? `Vault ${action} failed`
      logger.warn({ status: response.status, action }, `Vault proxy GET/${action} failed`)
      return envelopeError(detail, response.status)
    }

    return NextResponse.json({ success: true, data, error: null })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return envelopeError('Jarvis vault circuit is open — try again later', 503)
    }
    const message = err instanceof Error ? err.message : 'Vault service unavailable'
    logger.error({ err, action }, `Vault GET/${action} proxy error`)
    return envelopeError(
      message.includes('abort') ? 'Jarvis vault timed out (10s)' : message,
      502,
    )
  }
}

function resolveGetPath(action: string, request: NextRequest): string {
  if (action === 'status') return '/api/vault/status'

  // Decrypt requires a provider query param — maps to /api/vault/decrypt/:provider
  if (action === 'decrypt') {
    const provider = new URL(request.url).searchParams.get('provider')
    if (!provider) throw new Error('Missing "provider" query parameter for decrypt')
    return `/api/vault/decrypt/${encodeURIComponent(provider)}`
  }

  return `/api/vault/${action}`
}

// ---------------------------------------------------------------------------
// POST /api/vault/[action] — rotate, delete, replace
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  // All vault mutations require admin privileges
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { action: rawAction } = await params
  const action = validateAction(rawAction)
  if (!action) {
    return envelopeError(`Unknown vault action: ${rawAction}`, 400)
  }

  try {
    const { jarvisPath, method, body } = await resolvePostPayload(action, request)

    const response = await proxyToJarvis(jarvisPath, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }, request)

    const data: unknown = await response.json()

    if (!response.ok) {
      const detail = (data as Record<string, string>)?.detail ?? `Vault ${action} failed`
      logger.warn({ status: response.status, action }, `Vault proxy POST/${action} failed`)
      return envelopeError(detail, response.status)
    }

    return NextResponse.json({ success: true, data, error: null })
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return envelopeError('Jarvis vault circuit is open — try again later', 503)
    }
    const message = err instanceof Error ? err.message : 'Vault service unavailable'
    logger.error({ err, action }, `Vault POST/${action} proxy error`)
    return envelopeError(
      message.includes('abort') ? 'Jarvis vault timed out (10s)' : message,
      502,
    )
  }
}

// Maps panel actions to the correct Jarvis endpoint + HTTP method
async function resolvePostPayload(
  action: string,
  request: NextRequest,
): Promise<{ jarvisPath: string; method: string; body: unknown }> {
  if (action === 'rotate') {
    return { jarvisPath: '/api/vault/rotate', method: 'POST', body: null }
  }

  if (action === 'delete') {
    const payload = (await request.json()) as { id?: number }
    if (!payload.id || typeof payload.id !== 'number') {
      throw new Error('Missing or invalid "id" in delete payload')
    }
    return {
      jarvisPath: `/api/vault/${payload.id}`,
      method: 'DELETE',
      body: null,
    }
  }

  if (action === 'replace') {
    const payload = (await request.json()) as { provider?: string; key?: string }
    if (!payload.provider) throw new Error('Missing "provider" in replace payload')
    return {
      jarvisPath: `/api/vault/${encodeURIComponent(payload.provider)}`,
      method: 'PUT',
      body: { provider: payload.provider, key: payload.key },
    }
  }

  throw new Error(`Unsupported vault action: ${action}`)
}

export const dynamic = 'force-dynamic'
