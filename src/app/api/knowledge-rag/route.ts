import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

/**
 * Jarvis Knowledge RAG proxy.
 * GET  -> list all ingested documents
 * POST -> RAG query (search with retrieval-augmented generation)
 */

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'

// ── GET /api/knowledge-rag — list documents ────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limit = request.nextUrl.searchParams.get('limit') ?? '100'

  try {
    const res = await fetch(`${JARVIS_BASE}/api/knowledge/items?limit=${encodeURIComponent(limit)}`, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json(
        { error: `Jarvis responded with ${res.status}`, detail: body },
        { status: res.status },
      )
    }

    const data: unknown = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to reach Jarvis knowledge service', detail: message }, { status: 502 })
  }
}

// ── POST /api/knowledge-rag — RAG query ────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { query?: string; limit?: number }
  try {
    body = (await request.json()) as { query?: string; limit?: number }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
    return NextResponse.json({ error: 'Missing required field: query' }, { status: 400 })
  }

  try {
    const res = await fetch(`${JARVIS_BASE}/api/knowledge/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: body.query.trim(), limit: body.limit ?? 10 }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json(
        { error: `Jarvis search returned ${res.status}`, detail },
        { status: res.status },
      )
    }

    const data: unknown = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isTimeout = message.includes('abort') || message.includes('timeout')
    return NextResponse.json(
      { error: isTimeout ? 'RAG query timed out (30s)' : 'Failed to reach Jarvis', detail: message },
      { status: isTimeout ? 504 : 502 },
    )
  }
}
