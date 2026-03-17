import { NextRequest, NextResponse } from 'next/server'

/**
 * Dynamic calendar sub-route proxy.
 * Maps /api/calendar/<action> to the corresponding Jarvis endpoint.
 *
 * Supported actions:
 *   GET  connections       → GET  /api/calendar/connections
 *   GET  conflicts         → GET  /api/calendar/conflicts
 *   GET  availability      → GET  /api/calendar/availability
 *   POST sync-google       → POST /api/calendar/sync/google/{connection_id}
 *   POST sync-apple        → POST /api/calendar/sync/apple/{connection_id}
 *   POST create-event      → POST /api/calendar/events
 *   POST delete-connection → DELETE /api/calendar/connections/{connection_id}
 *   POST delete-event      → DELETE /api/calendar/events/{event_id}
 */

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 15_000

const VALID_GET_ACTIONS = new Set([
  'connections',
  'conflicts',
  'availability',
])

const VALID_POST_ACTIONS = new Set([
  'sync-google',
  'sync-apple',
  'create-event',
  'delete-connection',
  'delete-event',
])

// ── Helpers ──────────────────────────────────────────

async function fetchJarvis(
  url: string,
  options: RequestInit,
): Promise<NextResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const upstream = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    })

    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Jarvis request timed out' },
        { status: 504 },
      )
    }
    const message = err instanceof Error ? err.message : 'Proxy error'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}

function resolveGetUrl(
  action: string,
  searchParams: URLSearchParams,
): string {
  const base = new URL(`/api/calendar/${action}`, JARVIS_BASE)
  searchParams.forEach((value, key) => base.searchParams.set(key, value))
  return base.toString()
}

interface PostBody {
  readonly connection_id?: string
  readonly event_id?: string
  readonly [key: string]: unknown
}

function resolvePostPath(action: string, body: PostBody): {
  readonly path: string
  readonly method: string
} {
  switch (action) {
    case 'sync-google':
      return {
        path: `/api/calendar/sync/google/${body.connection_id ?? ''}`,
        method: 'POST',
      }
    case 'sync-apple':
      return {
        path: `/api/calendar/sync/apple/${body.connection_id ?? ''}`,
        method: 'POST',
      }
    case 'create-event':
      return { path: '/api/calendar/events', method: 'POST' }
    case 'delete-connection':
      return {
        path: `/api/calendar/connections/${body.connection_id ?? ''}`,
        method: 'DELETE',
      }
    case 'delete-event':
      return {
        path: `/api/calendar/events/${body.event_id ?? ''}`,
        method: 'DELETE',
      }
    default:
      return { path: `/api/calendar/${action}`, method: 'POST' }
  }
}

// ── Route Handlers ───────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  if (!VALID_GET_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `Unknown calendar action: ${action}` },
      { status: 404 },
    )
  }

  const url = resolveGetUrl(action, request.nextUrl.searchParams)
  return fetchJarvis(url, { method: 'GET' })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params

  if (!VALID_POST_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `Unknown calendar action: ${action}` },
      { status: 404 },
    )
  }

  const body: PostBody = await request.json().catch(() => ({}))
  const { path, method } = resolvePostPath(action, body)
  const url = new URL(path, JARVIS_BASE).toString()

  return fetchJarvis(url, {
    method,
    body: method === 'DELETE' ? undefined : JSON.stringify(body),
  })
}
