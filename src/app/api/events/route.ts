import { NextRequest, NextResponse } from 'next/server'
import { eventBus, ServerEvent, MAX_SSE_CONNECTIONS } from '@/lib/event-bus'
import { requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/events - Server-Sent Events stream for real-time DB mutations.
 * Clients connect via EventSource and receive JSON-encoded events.
 *
 * Security: backpressure via desiredSize check, max connection cap.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Reject when at capacity to prevent resource exhaustion
  if (!eventBus.addConnection()) {
    return NextResponse.json(
      { error: `Too many SSE connections (max ${MAX_SSE_CONNECTIONS})` },
      { status: 503 },
    )
  }

  const encoder = new TextEncoder()

  // Cleanup function, set in start(), called in cancel()
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', data: null, timestamp: Date.now() })}\n\n`)
      )

      // Forward workspace-scoped server events to this SSE client
      const userWorkspaceId = auth.user.workspace_id ?? 1
      const handler = (event: ServerEvent) => {
        // Skip events from other workspaces (if event carries workspace_id)
        if (event.data?.workspace_id && event.data.workspace_id !== userWorkspaceId) return
        try {
          // Backpressure: skip enqueue when the stream buffer is full.
          // desiredSize <= 0 means the consumer cannot keep up — dropping
          // the event is safer than unbounded memory growth.
          if (controller.desiredSize !== null && controller.desiredSize <= 0) return

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          )
        } catch {
          // Client disconnected, cleanup will happen in cancel()
        }
      }

      eventBus.on('server-event', handler)

      // Heartbeat every 30s to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30_000)

      cleanup = () => {
        eventBus.off('server-event', handler)
        clearInterval(heartbeat)
        eventBus.removeConnection()
      }
    },

    cancel() {
      // Client disconnected
      if (cleanup) cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
