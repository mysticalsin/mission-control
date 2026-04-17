import { getErrorMessage } from '@/lib/types/sql'
import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { syncAgentsFromConfig, previewSyncDiff } from '@/lib/agent-sync'
import { syncLocalAgents } from '@/lib/local-agent-sync'
import { logger } from '@/lib/logger'

/**
 * POST /api/agents/sync - Trigger agent config sync
 * ?source=local triggers local disk scan instead of openclaw.json sync.
 * Requires admin role.
 */
export const POST = apiGuard({ role: 'admin', rateLimit: 'mutation' }, async (request, auth) => {
  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source')

  try {
    if (source === 'local') {
      const result = await syncLocalAgents()
      return NextResponse.json(result)
    }

    const result = await syncAgentsFromConfig(auth.user.username)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    logger.error({ err: error }, 'POST /api/agents/sync error')
    return NextResponse.json({ error: getErrorMessage(error) || 'Sync failed' }, { status: 500 })
  }
})

/**
 * GET /api/agents/sync - Preview diff between openclaw.json and MC
 * Shows what would change without writing.
 */
export const GET = apiGuard({ role: 'admin', rateLimit: 'read' }, async (_request, _auth) => {
  try {
    const diff = await previewSyncDiff()
    return NextResponse.json(diff)
  } catch (error: unknown) {
    logger.error({ err: error }, 'GET /api/agents/sync error')
    return NextResponse.json({ error: getErrorMessage(error) || 'Preview failed' }, { status: 500 })
  }
})
