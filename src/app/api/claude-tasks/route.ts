import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { getClaudeCodeTasks } from '@/lib/claude-tasks'

/**
 * GET /api/claude-tasks — Returns Claude Code teams and tasks
 * Read-only bridge: MC reads from ~/.claude/tasks/ and ~/.claude/teams/
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (request, _auth) => {
  const force = request.nextUrl.searchParams.get('force') === 'true'
  const result = getClaudeCodeTasks(force)

  return NextResponse.json(result)
})
