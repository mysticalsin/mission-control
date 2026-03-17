import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'

// ── Types ────────────────────────────────────────────────────────────────────

type WebhookPlatform = 'discord' | 'teams' | 'slack'

interface MarketingWebhook {
  readonly id: number
  readonly platform: WebhookPlatform
  readonly url: string
  readonly enabled: number
  readonly created_at: number
  readonly updated_at: number
}

// ── Table bootstrap ──────────────────────────────────────────────────────────

function ensureTable(db: ReturnType<typeof getDatabase>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL CHECK(platform IN ('discord', 'teams', 'slack')),
      url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)
}

// ── GET — list configured webhooks ───────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = getDatabase()
  ensureTable(db)

  const rows = db.prepare(
    'SELECT id, platform, url, enabled, created_at, updated_at FROM marketing_webhooks ORDER BY created_at DESC'
  ).all() as MarketingWebhook[]

  return NextResponse.json({ webhooks: rows })
}

// ── POST — create or update a webhook ────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { platform?: string; url?: string; enabled?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const platform = (body.platform ?? '').trim().toLowerCase()
  const url = (body.url ?? '').trim()

  if (!['discord', 'teams', 'slack'].includes(platform)) {
    return NextResponse.json({ error: 'platform must be discord, teams, or slack' }, { status: 400 })
  }
  if (!url || !isValidWebhookUrl(url)) {
    return NextResponse.json({ error: 'A valid HTTPS webhook URL is required' }, { status: 400 })
  }

  const db = getDatabase()
  ensureTable(db)

  // Upsert: one webhook per platform
  const existing = db.prepare(
    'SELECT id FROM marketing_webhooks WHERE platform = ?'
  ).get(platform) as { id: number } | undefined

  if (existing) {
    db.prepare(
      'UPDATE marketing_webhooks SET url = ?, enabled = ?, updated_at = (unixepoch()) WHERE id = ?'
    ).run(url, body.enabled !== false ? 1 : 0, existing.id)
  } else {
    db.prepare(
      'INSERT INTO marketing_webhooks (platform, url, enabled) VALUES (?, ?, ?)'
    ).run(platform, url, body.enabled !== false ? 1 : 0)
  }

  return NextResponse.json({ ok: true })
}

// ── DELETE — remove a webhook by id ──────────────────────────────────────────

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { id?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const id = Number(body.id)
  if (!id || !Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Valid webhook id is required' }, { status: 400 })
  }

  const db = getDatabase()
  ensureTable(db)

  db.prepare('DELETE FROM marketing_webhooks WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}

// ── Webhook dispatch (called from pipeline completion) ───────────────────────

/**
 * Send a completed presentation notification to all enabled marketing webhooks.
 * Called server-side when a pipeline job completes.
 */
export async function dispatchPresentationWebhooks(job: {
  readonly id: string
  readonly quality_score: number
  readonly download_url: string
}): Promise<void> {
  let webhooks: MarketingWebhook[]
  try {
    const { getDatabase: getDb } = await import('@/lib/db')
    const db = getDb()
    ensureTable(db)
    webhooks = db.prepare(
      'SELECT id, platform, url, enabled FROM marketing_webhooks WHERE enabled = 1'
    ).all() as MarketingWebhook[]
  } catch {
    return // DB not ready
  }

  if (webhooks.length === 0) return

  const qualityPct = Math.round(job.quality_score * 100)
  const promises = webhooks.map(async (wh) => {
    try {
      const payload = buildPayload(wh.platform as WebhookPlatform, job.id, qualityPct, job.download_url)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)

      await fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      clearTimeout(timer)
    } catch (err) {
      logger.warn({ err, webhookId: wh.id, platform: wh.platform }, 'Marketing webhook delivery failed')
    }
  })

  await Promise.allSettled(promises)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Validate webhook URL: must be HTTPS and not target private/internal IPs (SSRF protection) */
function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false

    // Block private/internal hostnames to prevent SSRF
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^fc00:/i.test(hostname) ||
      /^fd[0-9a-f]{2}:/i.test(hostname)
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
}

/** Build platform-specific payload for presentation notification. */
function buildPayload(
  platform: WebhookPlatform,
  jobId: string,
  qualityPct: number,
  downloadUrl: string,
): Record<string, unknown> {
  const qualityEmoji = qualityPct >= 80 ? '\u2705' : qualityPct >= 50 ? '\u26a0\ufe0f' : '\u274c'
  const title = 'Presentation Ready'
  const description = `Pipeline job \`${jobId}\` completed.\n${qualityEmoji} Quality: **${qualityPct}%**\n[Download](${downloadUrl})`

  if (platform === 'discord') {
    return {
      embeds: [{
        title,
        description,
        color: qualityPct >= 80 ? 0x22c55e : qualityPct >= 50 ? 0xf59e0b : 0xef4444,
        footer: { text: 'Ultron Marketing Pipeline' },
      }],
    }
  }

  if (platform === 'teams') {
    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: qualityPct >= 80 ? '22c55e' : qualityPct >= 50 ? 'f59e0b' : 'ef4444',
      summary: title,
      sections: [{
        activityTitle: title,
        text: `Pipeline job \`${jobId}\` completed. ${qualityEmoji} Quality: **${qualityPct}%**`,
      }],
      potentialAction: [{
        '@type': 'OpenUri',
        name: 'Download',
        targets: [{ os: 'default', uri: downloadUrl }],
      }],
    }
  }

  // Slack
  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: title },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Pipeline job \`${jobId}\` completed.\n${qualityEmoji} Quality: *${qualityPct}%*\n<${downloadUrl}|Download Presentation>`,
        },
      },
    ],
  }
}

export const dynamic = 'force-dynamic'
