import { getErrorMessage } from '@/lib/types/sql'
import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { getProvisionJob, transitionProvisionJobStatus, ProvisionJobAction } from '@/lib/super-admin'

/**
 * GET /api/super/provision-jobs/[id] - Get job details and events
 */
export const GET = apiGuard({ role: 'admin', rateLimit: 'read' }, async (request, _auth) => {
  const id = Number(new URL(request.url).pathname.split('/').at(-1))
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })
  }

  const job = getProvisionJob(id)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  return NextResponse.json({ job })
})

/**
 * POST /api/super/provision-jobs/[id] - Change job approval state
 * Body: { action: 'approve' | 'reject' | 'cancel', reason?: string }
 */
export const POST = apiGuard({ role: 'admin', rateLimit: 'mutation' }, async (request, auth) => {
  const id = Number(new URL(request.url).pathname.split('/').at(-1))
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '') as ProvisionJobAction
    const reason = body?.reason ? String(body.reason) : undefined

    if (!['approve', 'reject', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Use approve, reject, or cancel.' }, { status: 400 })
    }

    const job = transitionProvisionJobStatus(id, auth.user.username, action, reason)
    return NextResponse.json({ job })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to update provisioning job state' }, { status: 400 })
  }
})
