import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { proxyToJarvis, envelope, envelopeError, CircuitOpenError } from '@/lib/jarvis-proxy'

// ---------------------------------------------------------------------------
// GET /api/vault — list all stored keys (masked values only)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const response = await proxyToJarvis('/api/vault', { method: 'GET' }, request)
    const data: unknown = await response.json()

    if (!response.ok) {
      const detail = (data as Record<string, string>)?.detail ?? 'Jarvis vault list failed'
      logger.warn({ status: response.status }, `Vault proxy GET failed: ${detail}`)
      return envelopeError(detail, response.status)
    }

    // Jarvis returns the array directly — wrap in our envelope
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return envelopeError('Jarvis vault circuit is open — try again later', 503)
    }
    const message = err instanceof Error ? err.message : 'Vault service unavailable'
    logger.error({ err }, 'Vault GET proxy error')
    return envelopeError(
      message.includes('abort') ? 'Jarvis vault timed out (10s)' : message,
      502,
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/vault — store a new encrypted key
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  // Storing keys is a sensitive mutation — admin only
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body: unknown = await request.json()
    const response = await proxyToJarvis('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, request)

    const data: unknown = await response.json()

    if (!response.ok) {
      const detail = (data as Record<string, string>)?.detail ?? 'Jarvis vault add failed'
      logger.warn({ status: response.status, body }, `Vault proxy POST failed: ${detail}`)
      return envelopeError(detail, response.status)
    }

    return envelope(data, 201)
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return envelopeError('Jarvis vault circuit is open — try again later', 503)
    }
    const message = err instanceof Error ? err.message : 'Vault service unavailable'
    logger.error({ err }, 'Vault POST proxy error')
    return envelopeError(
      message.includes('abort') ? 'Jarvis vault timed out (10s)' : message,
      502,
    )
  }
}

export const dynamic = 'force-dynamic'
