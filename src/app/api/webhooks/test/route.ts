import { NextResponse } from 'next/server'
import { apiGuard } from '@/lib/api-guard'
import { getDatabase } from '@/lib/db'
import { deliverWebhookPublic } from '@/lib/webhooks'
import { logger } from '@/lib/logger'

/**
 * POST /api/webhooks/test - Send a test event to a webhook
 */
export const POST = apiGuard({ role: 'admin', rateLimit: 'mutation' }, async (request, auth) => {
  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Webhook ID is required' }, { status: 400 })
    }

    const webhook = db.prepare('SELECT id, name, url, secret, events, enabled, last_fired_at, last_status, created_by, created_at, updated_at, workspace_id, consecutive_failures FROM webhooks WHERE id = ? AND workspace_id = ?').get(id, workspaceId) as { id: number; name: string; url: string; secret: string | null; events: string; enabled: number; workspace_id: number; consecutive_failures: number } | undefined
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    const payload = {
      message: 'This is a test webhook from Ultron Mission Control',
      webhook_id: webhook.id,
      webhook_name: webhook.name,
      triggered_by: auth.user.username,
    }

    const result = await deliverWebhookPublic(webhook, 'test.ping', payload, { allowRetry: false })

    return NextResponse.json(result)
  } catch (error) {
    logger.error({ err: error }, 'POST /api/webhooks/test error')
    return NextResponse.json({ error: 'Failed to test webhook' }, { status: 500 })
  }
})
