import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const READ_TIMEOUT_MS = 30_000
const RESEARCH_TIMEOUT_MS = 300_000 // 5 min — deep research can be slow

// ── GET /api/deep-research — list papers or check job status ─────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') ?? 'list'
  const jobId = searchParams.get('job_id')

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)

    const queryParams = jobId ? `?job_id=${encodeURIComponent(jobId)}` : ''
    const upstream = await fetch(
      `${JARVIS_BASE}/api/v2/research/${encodeURIComponent(action)}${queryParams}`,
      { signal: controller.signal },
    )
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error({ err }, 'Deep research GET proxy failed')
    return NextResponse.json(
      { error: `Failed to fetch research data: ${message}` },
      { status: 502 },
    )
  }
}

// ── POST /api/deep-research — start a new research job ───────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
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
    const timer = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/v2/research/start`, {
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
    logger.error({ err }, 'Deep research POST proxy failed')
    return NextResponse.json(
      { error: `Research job failed: ${message}` },
      { status: 502 },
    )
  }
}
