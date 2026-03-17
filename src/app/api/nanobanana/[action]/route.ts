import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const READ_TIMEOUT_MS = 30_000
const GENERATE_TIMEOUT_MS = 180_000

/**
 * Dynamic sub-routes for nanobanana:
 *   GET  /api/nanobanana/config          -> /api/v2/nanobanana/config
 *   GET  /api/nanobanana/status?id=X     -> /api/v2/nanobanana/status/{id}
 *   POST /api/nanobanana/animate         -> /api/v2/nanobanana/animate
 *   DELETE /api/nanobanana/delete?id=X   -> /api/v2/nanobanana/videos/{id}
 */

type RouteContext = { params: Promise<{ action: string }> }

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { action } = await context.params

  let upstreamPath: string
  let timeoutMs = READ_TIMEOUT_MS

  if (action === 'config') {
    upstreamPath = '/api/v2/nanobanana/config'
  } else if (action === 'status') {
    const videoId = request.nextUrl.searchParams.get('id')
    if (!videoId) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
    }
    upstreamPath = `/api/v2/nanobanana/status/${encodeURIComponent(videoId)}`
  } else if (action === 'videos') {
    const limit = request.nextUrl.searchParams.get('limit') ?? '20'
    const offset = request.nextUrl.searchParams.get('offset') ?? '0'
    upstreamPath = `/api/v2/nanobanana/videos?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
    timeoutMs = READ_TIMEOUT_MS
  } else {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 404 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const upstream = await fetch(`${JARVIS_BASE}${upstreamPath}`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Proxy request failed: ${message}` },
      { status: 502 },
    )
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { action } = await context.params

  if (action !== 'animate') {
    return NextResponse.json({ error: `Unknown POST action: ${action}` }, { status: 404 })
  }

  try {
    const body: unknown = await request.json()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/v2/nanobanana/animate`, {
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
    return NextResponse.json(
      { error: `Animate request failed: ${message}` },
      { status: 502 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { action } = await context.params

  if (action !== 'delete') {
    return NextResponse.json({ error: `Unknown DELETE action: ${action}` }, { status: 404 })
  }

  const recordId = request.nextUrl.searchParams.get('id')
  if (!recordId) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)

    const upstream = await fetch(
      `${JARVIS_BASE}/api/v2/nanobanana/videos/${encodeURIComponent(recordId)}`,
      { method: 'DELETE', signal: controller.signal },
    )
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Delete request failed: ${message}` },
      { status: 502 },
    )
  }
}
