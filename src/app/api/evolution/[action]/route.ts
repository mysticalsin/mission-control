import { NextResponse } from 'next/server'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 30_000

// Maps panel tab actions to upstream Jarvis endpoints
const ACTION_MAP: Readonly<Record<string, string>> = {
  timeline: '/api/v2/activity',
  capabilities: '/api/v2/flags',
  growth: '/api/v2/budget',
  status: '/api/v2/activity/stats',
}

async function proxyGet(upstreamPath: string): Promise<NextResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const upstream = await fetch(`${JARVIS_BASE}${upstreamPath}`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    clearTimeout(timer)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Upstream request failed: ${message}` },
      { status: 502 },
    )
  }
}

// GET /api/evolution/[action] -> proxy to corresponding Jarvis endpoint
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  const upstreamPath = ACTION_MAP[action]
  if (!upstreamPath) {
    return NextResponse.json(
      { error: `Unknown evolution action: ${action}` },
      { status: 400 },
    )
  }

  return proxyGet(upstreamPath)
}
