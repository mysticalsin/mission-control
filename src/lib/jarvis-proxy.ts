/**
 * Shared Jarvis proxy utilities.
 *
 * Centralises the repeated fetch-to-Jarvis pattern used across ~30 API routes
 * and wraps every call with a circuit breaker so cascading failures are cut off.
 */

import { NextRequest, NextResponse } from 'next/server'
import { executeWithCircuit, CircuitOpenError } from '@/lib/circuit-breaker'

// ── Constants ────────────────────────────────────────────────────────────────

export const JARVIS_BASE: string =
  process.env.JARVIS_URL ?? 'http://localhost:9472'

export const PROXY_TIMEOUT_MS = 10_000

// ── Response envelope helpers ────────────────────────────────────────────────

export function envelope(data: unknown, status: number = 200): NextResponse {
  return NextResponse.json(
    { success: status < 400, data, error: null },
    { status },
  )
}

export function envelopeError(message: string, status: number = 500): NextResponse {
  return NextResponse.json(
    { success: false, data: null, error: message },
    { status },
  )
}

// ── Auth header forwarding ───────────────────────────────────────────────────

function forwardAuthHeaders(
  headers: Headers,
  incoming: NextRequest,
): Headers {
  const cookie = incoming.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)

  const apiKey = incoming.headers.get('x-api-key')
  if (apiKey) headers.set('x-api-key', apiKey)

  const authorization = incoming.headers.get('authorization')
  if (authorization) headers.set('authorization', authorization)

  return headers
}

// ── Core proxy function ──────────────────────────────────────────────────────

/**
 * Proxy a request to the Jarvis backend with circuit breaker protection.
 *
 * @param path      - Jarvis API path (e.g. `/api/vault`)
 * @param init      - Standard RequestInit (method, headers, body, etc.)
 * @param incoming  - The original NextRequest (used for auth header forwarding)
 * @param timeoutMs - Per-request timeout override (default: PROXY_TIMEOUT_MS)
 */
export async function proxyToJarvis(
  path: string,
  init: RequestInit,
  incoming: NextRequest,
  timeoutMs: number = PROXY_TIMEOUT_MS,
): Promise<Response> {
  const url = `${JARVIS_BASE}${path}`
  const headers = forwardAuthHeaders(
    new Headers(init.headers ?? {}),
    incoming,
  )

  return executeWithCircuit('jarvis', () =>
    fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    }),
  )
}

// Re-export so route files can catch CircuitOpenError without a second import
export { CircuitOpenError }
