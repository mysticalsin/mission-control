import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

/**
 * Sub-routes for Knowledge RAG actions.
 * POST /api/knowledge-rag/ingest  -> ingest a new document
 * POST /api/knowledge-rag/search  -> alternative search endpoint
 */

const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'

interface RouteParams {
  readonly params: Promise<{ readonly action: string }>
}

// ── POST /api/knowledge-rag/[action] ──────────────────────────────────────

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { action } = await params
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (action === 'ingest') {
    return handleIngest(request)
  }

  if (action === 'search') {
    return handleSearch(request)
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 404 })
}

// ── Ingest handler ────────────────────────────────────────────────────────

async function handleIngest(request: NextRequest): Promise<NextResponse> {
  let body: {
    url?: string
    title?: string
    content?: string
    source_type?: string
    author?: string
    tags?: string[]
    file_data?: string
    file_name?: string
  }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.url && !body.content && !body.file_data) {
    return NextResponse.json({ error: 'Provide url, content, or a file to ingest' }, { status: 400 })
  }

  try {
    const payload: Record<string, unknown> = {
      url: body.url ?? '',
      title: body.title ?? '',
      content: body.content ?? '',
      source_type: body.source_type ?? 'url',
      author: body.author ?? '',
      tags: body.tags ?? [],
    }
    // Forward file data for binary files (PDF, DOCX) so Jarvis can extract text
    if (body.file_data) {
      payload.file_data = body.file_data
      payload.file_name = body.file_name ?? 'upload'
    }

    const res = await fetch(`${JARVIS_BASE}/api/knowledge/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json(
        { error: `Jarvis ingest returned ${res.status}`, detail },
        { status: res.status },
      )
    }

    const data: unknown = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to ingest via Jarvis', detail: message },
      { status: 502 },
    )
  }
}

// ── Search handler (alternative sub-route) ────────────────────────────────

async function handleSearch(request: NextRequest): Promise<NextResponse> {
  let body: { query?: string; limit?: number }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.query || typeof body.query !== 'string') {
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
      { error: isTimeout ? 'Search timed out (30s)' : 'Failed to reach Jarvis', detail: message },
      { status: isTimeout ? 504 : 502 },
    )
  }
}
