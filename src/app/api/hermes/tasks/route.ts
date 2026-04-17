import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { getHermesTasks } from '@/lib/hermes-tasks'

/**
 * GET /api/hermes/tasks — Returns Hermes cron jobs
 * Read-only bridge: MC reads from ~/.hermes/cron/
 */
export const GET = apiGuard({ role: 'viewer', rateLimit: 'read' }, async (request, _auth) => {
  const force = new URL(request.url).searchParams.get('force') === 'true'
  const result = getHermesTasks(force)
  return NextResponse.json(result)
})
