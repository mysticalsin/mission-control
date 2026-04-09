import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { getDatabase } from '@/lib/db'

export interface TaskSummary {
  task_id: number
  session_id: string | null
  step_count: number
  started_at: number
  ended_at: number
}

/**
 * GET /api/exec-replay/tasks
 * List distinct tasks that have execution traces, most recent first.
 * Returns up to 50 task summaries for the caller's workspace.
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (_request, auth) => {
  const workspaceId = auth.user.workspace_id ?? 1
  const db = getDatabase()

  const rows = db.prepare(`
    SELECT
      task_id,
      session_id,
      COUNT(*) AS step_count,
      MIN(created_at) AS started_at,
      MAX(created_at) AS ended_at
    FROM execution_traces
    WHERE workspace_id = ?
    GROUP BY task_id
    ORDER BY started_at DESC
    LIMIT 50
  `).all(workspaceId) as TaskSummary[]

  return NextResponse.json({ success: true, data: rows })
})
