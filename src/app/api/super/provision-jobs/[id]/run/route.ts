import { getErrorMessage } from '@/lib/types/sql'
import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { executeProvisionJob } from '@/lib/super-admin'

/**
 * POST /api/super/provision-jobs/[id]/run - Execute an approved provisioning job
 */
export const POST = apiGuard({ role: 'admin', rateLimit: 'mutation' }, async (request, auth) => {
  const id = Number(new URL(request.url).pathname.split('/').at(-2))
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })
  }

  try {
    const job = await executeProvisionJob(id, auth.user.username)
    return NextResponse.json({ job })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to execute provisioning job' }, { status: 400 })
  }
})
