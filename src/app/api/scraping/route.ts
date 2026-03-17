import { NextRequest, NextResponse } from 'next/server'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 60_000

// ── GET /api/scraping -> proxy to Jarvis /api/scraping/jobs ──────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/scraping/jobs`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data: unknown = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to fetch scraping jobs: ${message}` },
      { status: 502 },
    )
  }
}

// ── POST /api/scraping -> proxy to Jarvis /api/scraping/scrape ───────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/scraping/scrape`, {
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
      { error: `Failed to start scrape: ${message}` },
      { status: 502 },
    )
  }
}

export const dynamic = 'force-dynamic'
