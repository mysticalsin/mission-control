import type { SqlParam } from '@/lib/types/sql'

interface AgentRow {
  id: number; name: string; role: string; session_key: string | null
  status: string; last_seen: number | null; last_activity: string | null
  created_at: number; updated_at: number; config: string | null
  workspace_id: number; source: string | null; content_hash: string | null
  workspace_path: string | null
}

interface MentionRow {
  id: number; task_id: number; author: string; content: string
  created_at: number; task_title: string | null; mentions: string | null
  workspace_id: number
}

interface ActivityRow {
  id: number; type: string; entity_type: string | null; entity_id: number | null
  actor: string; description: string; data: string | null; created_at: number; workspace_id: number
}

interface TokenUsagePayload {
  model: string
  inputTokens: number
  outputTokens: number
  taskId?: unknown
}

import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, db_helpers } from '@/lib/db'
import { apiGuard } from '@/lib/api-guard'
import { logger } from '@/lib/logger'
import { resolveTaskImplementationTarget } from '@/lib/task-routing'
import type { Database } from 'better-sqlite3'

function resolveAgent(db: Database, agentId: string, workspaceId: number): AgentRow | undefined {
  if (isNaN(Number(agentId))) {
    return db.prepare('SELECT id, name, role, session_key, status, last_seen, last_activity, created_at, updated_at, config, workspace_id, source, content_hash, workspace_path FROM agents WHERE name = ? AND workspace_id = ?').get(agentId, workspaceId) as AgentRow | undefined
  }
  return db.prepare('SELECT id, name, role, session_key, status, last_seen, last_activity, created_at, updated_at, config, workspace_id, source, content_hash, workspace_path FROM agents WHERE id = ? AND workspace_id = ?').get(Number(agentId), workspaceId) as AgentRow | undefined
}

interface HeartbeatWorkItem {
  type: string
  count: number
  items: Record<string, unknown>[]
}

/**
 * Core heartbeat check logic — shared by both GET and POST handlers.
 * WHY: POST augments the GET response with token_recorded; extracting this
 * avoids calling the apiGuard-wrapped GET (which has a different signature).
 */
function performHeartbeatCheck(db: Database, agent: AgentRow, workspaceId: number): NextResponse {
  const workItems: HeartbeatWorkItem[] = []
  const now = Math.floor(Date.now() / 1000)
  const fourHoursAgo = now - (4 * 60 * 60)

  // 1. Check for @mentions in recent comments
  const mentions = db.prepare(`
    SELECT c.*, t.title as task_title
    FROM comments c
    JOIN tasks t ON c.task_id = t.id
    WHERE c.mentions LIKE ?
    AND c.workspace_id = ?
    AND t.workspace_id = ?
    AND c.created_at > ?
    ORDER BY c.created_at DESC
    LIMIT 10
  `).all(`%"${agent.name}"%`, workspaceId, workspaceId, fourHoursAgo)

  if (mentions.length > 0) {
    workItems.push({
      type: 'mentions',
      count: mentions.length,
      items: (mentions as MentionRow[]).map((m: MentionRow) => ({
        id: m.id,
        task_title: m.task_title,
        author: m.author,
        content: m.content.substring(0, 100) + '...',
        created_at: m.created_at,
      })),
    })
  }

  // 2. Check for assigned tasks
  const assignedTasks = db.prepare(`
    SELECT id, title, description, status, priority, assigned_to, created_by, created_at, updated_at, due_date, estimated_hours, actual_hours, tags, metadata, workspace_id, project_id, project_ticket_no, outcome, error_message, resolution, feedback_rating, feedback_notes, retry_count, completed_at, github_issue_number, github_repo, github_synced_at, github_branch, github_pr_number, github_pr_state FROM tasks
    WHERE assigned_to = ?
    AND workspace_id = ?
    AND status IN ('assigned', 'in_progress')
    ORDER BY priority DESC, created_at ASC
    LIMIT 10
  `).all(agent.name, workspaceId) as Record<string, unknown>[]

  if (assignedTasks.length > 0) {
    workItems.push({
      type: 'assigned_tasks',
      count: assignedTasks.length,
      items: assignedTasks.map((t: Record<string, unknown>) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date,
        ...resolveTaskImplementationTarget(t),
      })),
    })
  }

  // 3. Check for unread notifications
  const notifications = db_helpers.getUnreadNotifications(agent.name, workspaceId)

  if (notifications.length > 0) {
    workItems.push({
      type: 'notifications',
      count: notifications.length,
      items: notifications.slice(0, 5).map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        created_at: n.created_at,
      })),
    })
  }

  // 4. Check for urgent activities that might need attention
  const urgentActivities = db.prepare(`
    SELECT id, type, entity_type, entity_id, actor, description, data, created_at, workspace_id FROM activities
    WHERE type IN ('task_created', 'task_assigned', 'high_priority_alert')
    AND workspace_id = ?
    AND created_at > ?
    AND description LIKE ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(workspaceId, fourHoursAgo, `%${agent.name}%`)

  if (urgentActivities.length > 0) {
    workItems.push({
      type: 'urgent_activities',
      count: urgentActivities.length,
      items: (urgentActivities as ActivityRow[]).map((a: ActivityRow) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        created_at: a.created_at,
      })),
    })
  }

  db_helpers.updateAgentStatus(agent.name, 'idle', 'Heartbeat check', workspaceId)

  db_helpers.logActivity(
    'agent_heartbeat',
    'agent',
    agent.id,
    agent.name,
    `Heartbeat check completed - ${workItems.length > 0 ? `${workItems.length} work items found` : 'no work items'}`,
    { workItemsCount: workItems.length, workItemTypes: workItems.map(w => w.type) },
    workspaceId
  )

  if (workItems.length === 0) {
    return NextResponse.json({
      status: 'HEARTBEAT_OK',
      agent: agent.name,
      checked_at: now,
      message: 'No work items found',
    })
  }

  return NextResponse.json({
    status: 'WORK_ITEMS_FOUND',
    agent: agent.name,
    checked_at: now,
    work_items: workItems,
    total_items: workItems.reduce((sum, item) => sum + item.count, 0),
  })
}

/**
 * GET /api/agents/[id]/heartbeat - Agent heartbeat check
 *
 * Checks for @mentions, assigned tasks, notifications, and urgent activities.
 * Returns work items or "HEARTBEAT_OK" if nothing to do.
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (request, auth) => {
  try {
    const url = new URL(request.url)
    const agentId = url.pathname.split('/').at(-2) ?? ''
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1

    const agent = resolveAgent(db, agentId, workspaceId)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    return performHeartbeatCheck(db, agent, workspaceId)
  } catch (error) {
    logger.error({ err: error }, 'GET /api/agents/[id]/heartbeat error')
    return NextResponse.json({ error: 'Failed to perform heartbeat check' }, { status: 500 })
  }
})

/**
 * POST /api/agents/[id]/heartbeat - Enhanced heartbeat
 *
 * Accepts optional body:
 * - connection_id: update direct_connections.last_heartbeat
 * - status: agent status override
 * - last_activity: activity description
 * - token_usage: { model, inputTokens, outputTokens, taskId? } for inline token reporting
 */
export const POST = apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (request, auth) => {
  let body: Record<string, unknown> = {}
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    // No body is fine — fall through to standard heartbeat
  }

  const { connection_id, token_usage } = body
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  const workspaceId = auth.user.workspace_id ?? 1

  const url = new URL(request.url)
  const agentId = url.pathname.split('/').at(-2) ?? ''

  // Update direct connection heartbeat if connection_id provided
  if (connection_id) {
    db.prepare('UPDATE direct_connections SET last_heartbeat = ?, updated_at = ? WHERE connection_id = ? AND status = ? AND workspace_id = ?')
      .run(now, now, connection_id, 'connected', workspaceId)
  }

  // Inline token reporting
  let tokenRecorded = false
  const tu = token_usage != null && typeof token_usage === 'object' ? token_usage as TokenUsagePayload : null
  if (tu && tu.model && tu.inputTokens != null && tu.outputTokens != null) {
    const agent = resolveAgent(db, agentId, workspaceId)

    if (agent) {
      const sessionId = `${agent.name}:cli`
      const parsedTaskId =
        tu.taskId != null && Number.isFinite(Number(tu.taskId))
          ? Number(tu.taskId)
          : null

      let taskId: number | null = null
      if (parsedTaskId && parsedTaskId > 0) {
        const taskRow = db.prepare(
          'SELECT id FROM tasks WHERE id = ? AND workspace_id = ?'
        ).get(parsedTaskId, workspaceId) as { id?: number } | undefined
        if (taskRow?.id) {
          taskId = taskRow.id
        } else {
          logger.warn({ taskId: parsedTaskId, workspaceId, agent: agent.name }, 'Ignoring token usage with unknown taskId')
        }
      }

      db.prepare(
        `INSERT INTO token_usage (model, session_id, input_tokens, output_tokens, created_at, workspace_id, task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(tu.model, sessionId, tu.inputTokens, tu.outputTokens, now, workspaceId, taskId)
      tokenRecorded = true
    }
  }

  try {
    const agent = resolveAgent(db, agentId, workspaceId)
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const heartbeatResponse = performHeartbeatCheck(db, agent, workspaceId)
    const heartbeatBody = await heartbeatResponse.json()

    return NextResponse.json({ ...heartbeatBody, token_recorded: tokenRecorded })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/agents/[id]/heartbeat error')
    return NextResponse.json({ error: 'Failed to perform heartbeat check' }, { status: 500 })
  }
})
