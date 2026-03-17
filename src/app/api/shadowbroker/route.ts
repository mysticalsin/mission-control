import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { mutationLimiter, readLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 30_000

// ── GET /api/shadowbroker — list recent scans ────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/v2/shadowbroker/scans`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, 'Shadowbroker GET proxy failed')
    return NextResponse.json(
      { error: `Failed to fetch scans: ${message}` },
      { status: 502 },
    )
  }
}

// ── POST /api/shadowbroker — run a new OSINT scan ────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/v2/shadowbroker/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, 'Shadowbroker POST proxy failed')
    return NextResponse.json(
      { error: `Scan failed: ${message}` },
      { status: 502 },
    )
  }
}
