import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'
const TIMEOUT_MS = 30_000

// Maps Ultron sub-route actions to Jarvis upstream paths
const ACTION_MAP: Record<string, string> = {
  'usage': '/api/llm/usage',
  'health-check': '/api/llm/health-check',
  'models': '/api/llm/models',
  'budget': '/api/llm/budget',
  'failover-status': '/api/llm/failover-status',
  'settings-overview': '/api/llm/settings-overview',
  'cost-breakdown': '/api/llm/cost-breakdown',
} as const

// ---------------------------------------------------------------------------
// GET /api/neural/[action] -- proxy various read endpoints to Jarvis
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<Response> {
  const { action } = await params
  const upstream = ACTION_MAP[action]

  if (!upstream) {
    return NextResponse.json(
      { error: `Unknown neural action: ${action}` },
      { status: 404 },
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${JARVIS_BASE}${upstream}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Upstream request timed out' },
        { status: 504 },
      )
    }
    const message = err instanceof Error ? err.message : 'Proxy request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// POST /api/neural/[action] -- proxy write endpoints (budget reset, etc.)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<Response> {
  const { action } = await params

  // Only specific actions support POST
  const postActions: Record<string, string> = {
    'budget-reset': '/api/llm/budget/reset',
  }

  const upstream = postActions[action]
  if (!upstream) {
    return NextResponse.json(
      { error: `POST not supported for action: ${action}` },
      { status: 405 },
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let body: string | undefined
    try {
      const parsed = await request.json()
      body = JSON.stringify(parsed)
    } catch {
      // No body is acceptable for some endpoints
    }

    const res = await fetch(`${JARVIS_BASE}${upstream}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body } : {}),
      signal: controller.signal,
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Upstream request timed out' },
        { status: 504 },
      )
    }
    const message = err instanceof Error ? err.message : 'Proxy request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// PUT /api/neural/[action] -- proxy update endpoints (budget update)
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<Response> {
  const { action } = await params

  const putActions: Record<string, string> = {
    'budget': '/api/llm/budget',
  }

  const upstream = putActions[action]
  if (!upstream) {
    return NextResponse.json(
      { error: `PUT not supported for action: ${action}` },
      { status: 405 },
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const body = await request.json()

    const res = await fetch(`${JARVIS_BASE}${upstream}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Upstream request timed out' },
        { status: 504 },
      )
    }
    const message = err instanceof Error ? err.message : 'Proxy request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}
