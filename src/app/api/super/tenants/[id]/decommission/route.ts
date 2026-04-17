import { getErrorMessage } from '@/lib/types/sql'
import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { createTenantDecommissionJob } from '@/lib/super-admin'

/**
 * POST /api/super/tenants/[id]/decommission
 * Body: { dry_run?: boolean, remove_linux_user?: boolean, remove_state_dirs?: boolean, reason?: string }
 */
export const POST = apiGuard({ role: 'admin', rateLimit: 'mutation' }, async (request, auth) => {
  const tenantId = Number(new URL(request.url).pathname.split('/').at(-2))
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return NextResponse.json({ error: 'Invalid tenant id' }, { status: 400 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const created = createTenantDecommissionJob(tenantId, {
      dry_run: body?.dry_run,
      remove_linux_user: body?.remove_linux_user,
      remove_state_dirs: body?.remove_state_dirs,
      reason: body?.reason,
    }, auth.user.username)

    return NextResponse.json(created, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to queue tenant decommission job' }, { status: 400 })
  }
})
