import { SqlParam } from '@/lib/types/sql'
import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'

export interface HandoffStep {
  agentName: string
  promptTemplate: string
  label: string
}

export interface HandoffChain {
  id: number
  name: string
  description: string | null
  steps: string // JSON
  status: string
  created_by: string | null
  workspace_id: number
  created_at: number
  updated_at: number
}

export interface HandoffChainParsed extends Omit<HandoffChain, 'steps'> {
  steps: HandoffStep[]
}

function parseChain(chain: HandoffChain): HandoffChainParsed {
  return {
    ...chain,
    steps: JSON.parse(chain.steps || '[]') as HandoffStep[],
  }
}

/**
 * GET /api/handoff-chains — list all chains for the workspace
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (_request, auth) => {
  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const chains = db
      .prepare(
        'SELECT id, name, description, steps, status, created_by, workspace_id, created_at, updated_at FROM handoff_chains WHERE workspace_id = ? ORDER BY updated_at DESC'
      )
      .all(workspaceId) as HandoffChain[]

    return NextResponse.json({ success: true, data: chains.map(parseChain) })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/handoff-chains error')
    return NextResponse.json({ error: 'Failed to fetch handoff chains' }, { status: 500 })
  }
})

/**
 * POST /api/handoff-chains — create a new chain
 */
export const POST = apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (request, auth) => {
  try {
    const body = await request.json() as { name?: unknown; description?: unknown; steps?: unknown }
    const { name, description, steps } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const cleanSteps: HandoffStep[] = Array.isArray(steps)
      ? (steps as HandoffStep[]).map(s => ({
          agentName: String(s.agentName ?? ''),
          promptTemplate: String(s.promptTemplate ?? ''),
          label: String(s.label ?? ''),
        }))
      : []

    const params: SqlParam[] = [
      name.trim(),
      description ? String(description).trim() : null,
      JSON.stringify(cleanSteps),
      auth.user?.username || 'system',
      auth.user.workspace_id ?? 1,
    ]

    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1

    const result = db
      .prepare(
        'INSERT INTO handoff_chains (name, description, steps, created_by, workspace_id) VALUES (?, ?, ?, ?, ?)'
      )
      .run(...params)

    const chain = db
      .prepare(
        'SELECT id, name, description, steps, status, created_by, workspace_id, created_at, updated_at FROM handoff_chains WHERE id = ? AND workspace_id = ?'
      )
      .get(result.lastInsertRowid, workspaceId) as HandoffChain

    return NextResponse.json({ success: true, data: parseChain(chain) }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/handoff-chains error')
    return NextResponse.json({ error: 'Failed to create handoff chain' }, { status: 500 })
  }
})
