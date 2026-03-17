import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Jarvis backend base URL -- all LLM operations proxy through here
const JARVIS_BASE = process.env.JARVIS_URL ?? 'http://localhost:9472'

// Longer timeout for LLM generation (models can take 30s+)
const LLM_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function proxyGet(path: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  try {
    const upstream = await fetch(`${JARVIS_BASE}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    })
    const body = await upstream.json()
    return NextResponse.json(body, { status: upstream.status })
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
// GET /api/neural -- list providers with health status
// ---------------------------------------------------------------------------

export async function GET(): Promise<Response> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

    const upstream = await fetch(`${JARVIS_BASE}/api/llm/providers`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = (await upstream.json()) as Record<string, unknown>
    return NextResponse.json(data, { status: upstream.status })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Upstream request timed out' },
        { status: 504 },
      )
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch providers'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/neural -- send chat message to Jarvis LLM router
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as {
      prompt?: string
      provider?: string
      model?: string
    }

    if (!body.prompt || typeof body.prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 },
      )
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

    // Build the Jarvis chat payload
    const chatPayload = {
      message: body.prompt,
      provider: body.provider !== 'auto' ? body.provider : undefined,
      model: body.model || undefined,
    }

    const upstream = await fetch(`${JARVIS_BASE}/api/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = (await upstream.json()) as Record<string, unknown>

    if (!upstream.ok) {
      return NextResponse.json(
        { error: (data.detail as string) ?? 'LLM request failed' },
        { status: upstream.status },
      )
    }

    // Normalize into ChatMessage shape for the frontend
    return NextResponse.json({
      role: 'assistant',
      content: (data.response as string) ?? (data.content as string) ?? '',
      provider: (data.provider as string) ?? undefined,
      model: (data.model as string) ?? undefined,
      timestamp: Date.now(),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'LLM response timed out (30s)' },
        { status: 504 },
      )
    }
    const message = err instanceof Error ? err.message : 'Chat request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
