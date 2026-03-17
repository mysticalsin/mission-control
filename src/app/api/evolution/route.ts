import { NextRequest, NextResponse } from 'next/server'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 30_000

// GET /api/evolution -> proxy to Jarvis /api/evolution/status
export async function GET(): Promise<NextResponse> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/v2/activity/stats`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to fetch evolution status: ${message}` },
      { status: 502 },
    )
  }
}

// POST /api/evolution -> proxy to Jarvis for evolution assessment
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(
      `${JARVIS_BASE}/api/v2/boards/daily-reset`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    )
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to run evolution assessment: ${message}` },
      { status: 502 },
    )
  }
}
