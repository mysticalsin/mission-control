import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const READ_TIMEOUT_MS = 30_000
const GENERATE_TIMEOUT_MS = 180_000

// ---------------------------------------------------------------------------
// GET /api/nanobanana -> proxy to Jarvis /api/v2/nanobanana/videos
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit') ?? '20'
    const offset = searchParams.get('offset') ?? '0'

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)

    const upstream = await fetch(
      `${JARVIS_BASE}/api/v2/nanobanana/videos?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
      { signal: controller.signal },
    )
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ err: error }, 'NanoBanana GET proxy failed')
    return NextResponse.json(
      { error: `Failed to fetch videos: ${message}` },
      { status: 502 },
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/nanobanana -> proxy to Jarvis /api/v2/nanobanana/generate
// ---------------------------------------------------------------------------

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
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/v2/nanobanana/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ err: error }, 'NanoBanana POST proxy failed')
    return NextResponse.json(
      { error: `Failed to generate video: ${message}` },
      { status: 502 },
    )
  }
}
