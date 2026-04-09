interface AgentRow {
  id: number; name: string; role: string; session_key: string | null
  status: string; last_seen: number | null; last_activity: string | null
  created_at: number; updated_at: number; config: string | null
  workspace_id: number; source: string | null; content_hash: string | null
  workspace_path: string | null
}

interface PragmaColumnRow { name: string; [key: string]: unknown }
interface WorkingMemoryRow { working_memory: string | null }

import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, db_helpers } from '@/lib/db'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveWithin } from '@/lib/paths'
import { getAgentWorkspaceCandidates, readAgentWorkspaceFile } from '@/lib/agent-workspace'

function resolveAgentById(db: ReturnType<typeof getDatabase>, agentId: string, workspaceId: number): AgentRow | undefined {
  if (isNaN(Number(agentId))) {
    return db.prepare('SELECT id, name, role, session_key, status, last_seen, last_activity, created_at, updated_at, config, workspace_id, source, content_hash, workspace_path FROM agents WHERE name = ? AND workspace_id = ?').get(agentId, workspaceId) as AgentRow | undefined
  }
  return db.prepare('SELECT id, name, role, session_key, status, last_seen, last_activity, created_at, updated_at, config, workspace_id, source, content_hash, workspace_path FROM agents WHERE id = ? AND workspace_id = ?').get(Number(agentId), workspaceId) as AgentRow | undefined
}

function ensureWorkingMemoryColumn(db: ReturnType<typeof getDatabase>): void {
  const columns = db.prepare('PRAGMA table_info(agents)').all() as PragmaColumnRow[]
  const hasWorkingMemory = columns.some((col) => col.name === 'working_memory')
  if (!hasWorkingMemory) {
    db.exec("ALTER TABLE agents ADD COLUMN working_memory TEXT DEFAULT ''")
  }
}

/**
 * GET /api/agents/[id]/memory - Get agent's working memory
 *
 * Working memory is stored in the agents.working_memory DB column.
 * This endpoint is per-agent scratchpad memory (not the global Memory Browser filesystem view).
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (request, auth) => {
  try {
    const db = getDatabase()
    const url = new URL(request.url)
    const agentId = url.pathname.split('/').at(-2) ?? ''
    const workspaceId = auth.user.workspace_id ?? 1

    const agent = resolveAgentById(db, agentId, workspaceId)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    ensureWorkingMemoryColumn(db)

    // Prefer workspace WORKING.md, fall back to DB working_memory
    let workingMemory = ''
    let source: 'workspace' | 'database' | 'none' = 'none'
    try {
      const agentConfig = agent.config ? JSON.parse(agent.config) : {}
      const candidates = getAgentWorkspaceCandidates(agentConfig, agent.name)
      const match = readAgentWorkspaceFile(candidates, ['WORKING.md', 'working.md', 'MEMORY.md', 'memory.md'])
      if (match.exists) {
        workingMemory = match.content
        source = 'workspace'
      }
    } catch (err) {
      logger.warn({ err, agent: agent.name }, 'Failed to read WORKING.md from workspace')
    }

    const memoryStmt = db.prepare(`SELECT working_memory FROM agents WHERE ${isNaN(Number(agentId)) ? 'name' : 'id'} = ? AND workspace_id = ?`)
    const result = memoryStmt.get(agentId, workspaceId) as WorkingMemoryRow | undefined
    if (!workingMemory) {
      workingMemory = result?.working_memory || ''
      source = workingMemory ? 'database' : 'none'
    }

    return NextResponse.json({
      agent: { id: agent.id, name: agent.name, role: agent.role },
      working_memory: workingMemory,
      source,
      updated_at: agent.updated_at,
      size: workingMemory.length,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/agents/[id]/memory error')
    return NextResponse.json({ error: 'Failed to fetch working memory' }, { status: 500 })
  }
})

/**
 * PUT /api/agents/[id]/memory - Update agent's working memory
 */
export const PUT = apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (request, auth) => {
  try {
    const db = getDatabase()
    const url = new URL(request.url)
    const agentId = url.pathname.split('/').at(-2) ?? ''
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()
    const { working_memory, append } = body

    const agent = resolveAgentById(db, agentId, workspaceId)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    ensureWorkingMemoryColumn(db)

    let newContent = working_memory || ''

    // Handle append mode
    if (append) {
      const currentStmt = db.prepare(`SELECT working_memory FROM agents WHERE ${isNaN(Number(agentId)) ? 'name' : 'id'} = ? AND workspace_id = ?`)
      const current = currentStmt.get(agentId, workspaceId) as WorkingMemoryRow | undefined
      const currentContent = current?.working_memory || ''
      const timestamp = new Date().toISOString()
      newContent = currentContent + (currentContent ? '\n\n' : '') + `## ${timestamp}\n${working_memory}`
    }

    const now = Math.floor(Date.now() / 1000)

    // Best effort: sync workspace WORKING.md if agent workspace is configured
    let savedToWorkspace = false
    try {
      const agentConfig = agent.config ? JSON.parse(agent.config) : {}
      const candidates = getAgentWorkspaceCandidates(agentConfig, agent.name)
      const safeWorkspace = candidates[0]
      if (safeWorkspace) {
        const safeWorkingPath = resolveWithin(safeWorkspace, 'WORKING.md')
        mkdirSync(dirname(safeWorkingPath), { recursive: true })
        writeFileSync(safeWorkingPath, newContent, 'utf-8')
        savedToWorkspace = true
      }
    } catch (err) {
      logger.warn({ err, agent: agent.name }, 'Failed to write WORKING.md to workspace')
    }

    db.prepare(`
      UPDATE agents
      SET working_memory = ?, updated_at = ?
      WHERE ${isNaN(Number(agentId)) ? 'name' : 'id'} = ? AND workspace_id = ?
    `).run(newContent, now, agentId, workspaceId)

    db_helpers.logActivity(
      'agent_memory_updated',
      'agent',
      agent.id,
      agent.name,
      `Working memory ${append ? 'appended' : 'updated'} for agent ${agent.name}`,
      { content_length: newContent.length, append_mode: append || false, timestamp: now, saved_to_workspace: savedToWorkspace },
      workspaceId
    )

    return NextResponse.json({
      success: true,
      message: `Working memory ${append ? 'appended' : 'updated'} for ${agent.name}`,
      working_memory: newContent,
      saved_to_workspace: savedToWorkspace,
      updated_at: now,
      size: newContent.length,
    })
  } catch (error) {
    logger.error({ err: error }, 'PUT /api/agents/[id]/memory error')
    return NextResponse.json({ error: 'Failed to update working memory' }, { status: 500 })
  }
})

/**
 * DELETE /api/agents/[id]/memory - Clear agent's working memory
 */
export const DELETE = apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (request, auth) => {
  try {
    const db = getDatabase()
    const url = new URL(request.url)
    const agentId = url.pathname.split('/').at(-2) ?? ''
    const workspaceId = auth.user.workspace_id ?? 1

    const agent = resolveAgentById(db, agentId, workspaceId)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const now = Math.floor(Date.now() / 1000)

    // Best effort: clear workspace WORKING.md if agent workspace is configured
    try {
      const agentConfig = agent.config ? JSON.parse(agent.config) : {}
      const candidates = getAgentWorkspaceCandidates(agentConfig, agent.name)
      const safeWorkspace = candidates[0]
      if (safeWorkspace) {
        const safeWorkingPath = resolveWithin(safeWorkspace, 'WORKING.md')
        mkdirSync(dirname(safeWorkingPath), { recursive: true })
        writeFileSync(safeWorkingPath, '', 'utf-8')
      }
    } catch (err) {
      logger.warn({ err, agent: agent.name }, 'Failed to clear WORKING.md in workspace')
    }

    db.prepare(`
      UPDATE agents
      SET working_memory = '', updated_at = ?
      WHERE ${isNaN(Number(agentId)) ? 'name' : 'id'} = ? AND workspace_id = ?
    `).run(now, agentId, workspaceId)

    db_helpers.logActivity(
      'agent_memory_cleared',
      'agent',
      agent.id,
      agent.name,
      `Working memory cleared for agent ${agent.name}`,
      { timestamp: now },
      workspaceId
    )

    return NextResponse.json({
      success: true,
      message: `Working memory cleared for ${agent.name}`,
      working_memory: '',
      updated_at: now,
    })
  } catch (error) {
    logger.error({ err: error }, 'DELETE /api/agents/[id]/memory error')
    return NextResponse.json({ error: 'Failed to clear working memory' }, { status: 500 })
  }
})
