import { NextRequest, NextResponse } from 'next/server'

/**
 * Jarvis calendar proxy — base route.
 * GET  → fetches unified calendar events from Jarvis
 * POST → triggers a manual sync (legacy shorthand)
 */

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 15_000

// ── Helpers ──────────────────────────────────────────

async function proxyGet(
  jarvisPath: string,
  searchParams: URLSearchParams,
): Promise<NextResponse> {
  const url = new URL(jarvisPath, JARVIS_BASE)
  searchParams.forEach((value, key) => url.searchParams.set(key, value))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const upstream = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    const body = await upstream.json()
    return NextResponse.json(body, { status: upstream.status })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Jarvis calendar request timed out' },
        { status: 504 },
      )
    }
    const message = err instanceof Error ? err.message : 'Proxy error'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}

async function proxyPost(
  jarvisPath: string,
  body: unknown,
): Promise<NextResponse> {
  const url = new URL(jarvisPath, JARVIS_BASE)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const upstream = await fetch(url.toString(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Jarvis calendar sync timed out' },
        { status: 504 },
      )
    }
    const message = err instanceof Error ? err.message : 'Proxy error'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}

// ── Route Handlers ───────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyGet('/api/calendar/events', request.nextUrl.searchParams)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}))
  return proxyPost('/api/calendar/sync', body)
}
