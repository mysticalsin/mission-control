import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'

export interface HandoffChainRun {
  id: number
  chain_id: number
  status: string
  current_step: number
  input_data: string | null
  output_data: string | null
  error: string | null
  started_at: number
  completed_at: number | null
  workspace_id: number
}

/**
 * POST /api/handoff-chains/[id]/run — create a new run record for the chain.
 * Actual async execution is out of scope; this returns the created run id.
 */
export const POST = apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (request, auth) => {
  try {
    // Extract chain id from path: /api/handoff-chains/[id]/run
    const segments = new URL(request.url).pathname.split('/')
    const id = segments.at(-2) ?? ''
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const chainId = parseInt(id, 10)

    // Verify the chain exists and belongs to this workspace
    const chain = db
      .prepare('SELECT id FROM handoff_chains WHERE id = ? AND workspace_id = ?')
      .get(chainId, workspaceId)
    if (!chain) return NextResponse.json({ error: 'Chain not found' }, { status: 404 })

    const body = await request.json().catch(() => ({})) as { input_data?: unknown }
    const inputData = body.input_data ? String(body.input_data) : null

    const result = db
      .prepare(
        'INSERT INTO handoff_chain_runs (chain_id, status, current_step, input_data, workspace_id) VALUES (?, ?, ?, ?, ?)'
      )
      .run(chainId, 'running', 0, inputData, workspaceId)

    const run = db
      .prepare(
        'SELECT id, chain_id, status, current_step, input_data, output_data, error, started_at, completed_at, workspace_id FROM handoff_chain_runs WHERE id = ?'
      )
      .get(result.lastInsertRowid) as HandoffChainRun

    return NextResponse.json({ success: true, data: run }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/handoff-chains/[id]/run error')
    return NextResponse.json({ error: 'Failed to create chain run' }, { status: 500 })
  }
})
