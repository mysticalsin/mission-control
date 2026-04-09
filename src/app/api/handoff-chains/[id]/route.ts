import { SqlParam } from '@/lib/types/sql'
import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'
import type { HandoffChain, HandoffChainParsed, HandoffStep } from '../route'

function parseChain(chain: HandoffChain): HandoffChainParsed {
  return {
    ...chain,
    steps: JSON.parse(chain.steps || '[]') as HandoffStep[],
  }
}

/**
 * GET /api/handoff-chains/[id] — get a single chain by id
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (request, auth) => {
  try {
    const id = new URL(request.url).pathname.split('/').at(-1) ?? ''
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1

    const chain = db
      .prepare(
        'SELECT id, name, description, steps, status, created_by, workspace_id, created_at, updated_at FROM handoff_chains WHERE id = ? AND workspace_id = ?'
      )
      .get(parseInt(id, 10), workspaceId) as HandoffChain | undefined

    if (!chain) return NextResponse.json({ error: 'Chain not found' }, { status: 404 })

    return NextResponse.json({ success: true, data: parseChain(chain) })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/handoff-chains/[id] error')
    return NextResponse.json({ error: 'Failed to fetch handoff chain' }, { status: 500 })
  }
})

/**
 * PATCH /api/handoff-chains/[id] — update chain fields
 */
export const PATCH = apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (request, auth) => {
  try {
    const id = new URL(request.url).pathname.split('/').at(-1) ?? ''
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1

    const existing = db
      .prepare('SELECT id FROM handoff_chains WHERE id = ? AND workspace_id = ?')
      .get(parseInt(id, 10), workspaceId)
    if (!existing) return NextResponse.json({ error: 'Chain not found' }, { status: 404 })

    const body = await request.json() as {
      name?: unknown; description?: unknown; steps?: unknown; status?: unknown
    }

    const fields: string[] = []
    const values: SqlParam[] = []

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
      }
      fields.push('name = ?')
      values.push(body.name.trim())
    }
    if (body.description !== undefined) {
      fields.push('description = ?')
      values.push(body.description ? String(body.description).trim() : null)
    }
    if (body.steps !== undefined) {
      const cleanSteps: HandoffStep[] = Array.isArray(body.steps)
        ? (body.steps as HandoffStep[]).map(s => ({
            agentName: String(s.agentName ?? ''),
            promptTemplate: String(s.promptTemplate ?? ''),
            label: String(s.label ?? ''),
          }))
        : []
      fields.push('steps = ?')
      values.push(JSON.stringify(cleanSteps))
    }
    if (body.status !== undefined) {
      const validStatuses = ['draft', 'active', 'archived']
      if (!validStatuses.includes(String(body.status))) {
        return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
      }
      fields.push('status = ?')
      values.push(String(body.status))
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    fields.push('updated_at = ?')
    values.push(Math.floor(Date.now() / 1000))
    values.push(parseInt(id, 10), workspaceId)

    db.prepare(`UPDATE handoff_chains SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...values)

    const updated = db
      .prepare(
        'SELECT id, name, description, steps, status, created_by, workspace_id, created_at, updated_at FROM handoff_chains WHERE id = ? AND workspace_id = ?'
      )
      .get(parseInt(id, 10), workspaceId) as HandoffChain

    return NextResponse.json({ success: true, data: parseChain(updated) })
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/handoff-chains/[id] error')
    return NextResponse.json({ error: 'Failed to update handoff chain' }, { status: 500 })
  }
})

/**
 * DELETE /api/handoff-chains/[id] — delete chain and cascade runs
 */
export const DELETE = apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (request, auth) => {
  try {
    const id = new URL(request.url).pathname.split('/').at(-1) ?? ''
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1

    const existing = db
      .prepare('SELECT id FROM handoff_chains WHERE id = ? AND workspace_id = ?')
      .get(parseInt(id, 10), workspaceId)
    if (!existing) return NextResponse.json({ error: 'Chain not found' }, { status: 404 })

    // Cascade handled by FK ON DELETE CASCADE, but we delete runs explicitly for clarity
    db.prepare('DELETE FROM handoff_chain_runs WHERE chain_id = ?').run(parseInt(id, 10))
    db.prepare('DELETE FROM handoff_chains WHERE id = ? AND workspace_id = ?').run(parseInt(id, 10), workspaceId)

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ err: error }, 'DELETE /api/handoff-chains/[id] error')
    return NextResponse.json({ error: 'Failed to delete handoff chain' }, { status: 500 })
  }
})
