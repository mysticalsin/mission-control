import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { getSchedulerStatus, triggerTask } from '@/lib/scheduler'

/**
 * GET /api/scheduler - Get scheduler status
 */
export const GET = apiGuard({ role: 'admin', rateLimit: 'read' }, async (_request, _auth) => {
  return NextResponse.json({ tasks: getSchedulerStatus() })
})

/**
 * POST /api/scheduler - Manually trigger a scheduled task
 * Body: { task_id: 'auto_backup' | 'auto_cleanup' | 'agent_heartbeat' }
 */
export const POST = apiGuard({ role: 'admin', rateLimit: 'mutation' }, async (request, _auth) => {
  const body = await request.json().catch(() => ({}))
  const taskId = typeof body?.task_id === 'string' ? body.task_id : ''
  const allowedTaskIds = new Set(getSchedulerStatus().map((task) => task.id))

  if (!taskId || !allowedTaskIds.has(taskId)) {
    return NextResponse.json({
      error: `task_id required: ${Array.from(allowedTaskIds).join(', ')}`,
    }, { status: 400 })
  }

  const result = await triggerTask(taskId)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
})
