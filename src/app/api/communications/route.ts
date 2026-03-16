import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { validateBody } from '@/lib/validation'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getDatabase } from '@/lib/db'

// ---------------------------------------------------------------------------
// Lazy table creation — idempotent, runs once per process
// ---------------------------------------------------------------------------

let tablesEnsured = false

function ensureTables(): void {
  if (tablesEnsured) return
  const db = getDatabase()

  db.exec(`
    CREATE TABLE IF NOT EXISTS comms_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('discord','telegram','whatsapp','slack','email','sms','imessage')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','error')),
      webhook_url TEXT NOT NULL DEFAULT '',
      last_message_at INTEGER DEFAULT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS comms_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES comms_channels(id) ON DELETE CASCADE,
      direction TEXT NOT NULL DEFAULT 'inbound' CHECK(direction IN ('inbound','outbound')),
      sender TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const addChannelSchema = z.object({
  action: z.literal('add_channel'),
  name: z.string().min(1).max(200),
  platform: z.enum(['discord', 'telegram', 'whatsapp', 'slack', 'email', 'sms', 'imessage']),
  webhook_url: z.string().url().max(2000).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const sendMessageSchema = z.object({
  action: z.literal('send_message'),
  channel_id: z.number().int().positive(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  sender: z.string().max(200).optional(),
  content: z.string().min(1).max(10000),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const postBodySchema = z.discriminatedUnion('action', [
  addChannelSchema,
  sendMessageSchema,
])

const patchBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(['active', 'inactive', 'error']).optional(),
  name: z.string().min(1).max(200).optional(),
  webhook_url: z.string().url().max(2000).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const deleteBodySchema = z.object({
  entity: z.enum(['channel', 'message']),
  id: z.number().int().positive(),
})

// ---------------------------------------------------------------------------
// GET /api/communications?tab=channels|messages|stats
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') ?? 'channels'

  try {
    ensureTables()
    const db = getDatabase()

    if (tab === 'channels') return handleGetChannels(db, searchParams)
    if (tab === 'messages') return handleGetMessages(db, searchParams)
    if (tab === 'stats') return handleGetStats(db)

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Communications GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetChannels(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const platform = params.get('platform')
  const status = params.get('status')

  let query = `SELECT id, name, platform, status, webhook_url, last_message_at,
               message_count, config_json, created_at, updated_at
               FROM comms_channels WHERE 1=1`
  const queryParams: unknown[] = []

  if (platform) {
    query += ' AND platform = ?'
    queryParams.push(platform)
  }
  if (status) {
    query += ' AND status = ?'
    queryParams.push(status)
  }

  query += ' ORDER BY updated_at DESC LIMIT 100'
  const channels = db.prepare(query).all(...queryParams)
  return NextResponse.json({ channels })
}

function handleGetMessages(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const channelId = params.get('channel_id')
  const direction = params.get('direction')

  let query = `SELECT m.id, m.channel_id, c.name AS channel_name, c.platform,
               m.direction, m.sender, m.content, m.metadata_json, m.created_at
               FROM comms_messages m
               JOIN comms_channels c ON c.id = m.channel_id
               WHERE 1=1`
  const queryParams: unknown[] = []

  if (channelId) {
    query += ' AND m.channel_id = ?'
    queryParams.push(parseInt(channelId, 10))
  }
  if (direction) {
    query += ' AND m.direction = ?'
    queryParams.push(direction)
  }

  query += ' ORDER BY m.created_at DESC LIMIT 200'
  const messages = db.prepare(query).all(...queryParams)
  return NextResponse.json({ messages })
}

function handleGetStats(db: ReturnType<typeof getDatabase>): NextResponse {
  const platformStats = db.prepare(`
    SELECT c.platform,
           COUNT(DISTINCT c.id) AS active_channels,
           COALESCE(SUM(c.message_count), 0) AS total_messages,
           MAX(c.last_message_at) AS last_activity
    FROM comms_channels c
    WHERE c.status = 'active'
    GROUP BY c.platform
    ORDER BY total_messages DESC
  `).all() as Array<{
    platform: string
    active_channels: number
    total_messages: number
    last_activity: number | null
  }>

  const totals = db.prepare(`
    SELECT COUNT(*) AS total_channels,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
           SUM(message_count) AS total_messages
    FROM comms_channels
  `).get() as { total_channels: number; active_count: number; total_messages: number }

  return NextResponse.json({ platformStats, totals })
}

// ---------------------------------------------------------------------------
// POST /api/communications
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, postBodySchema)
  if ('error' in validated) return validated.error

  try {
    ensureTables()
    return dispatchPostAction(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'Communications POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PostAction = z.infer<typeof postBodySchema>

function dispatchPostAction(data: PostAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.action) {
    case 'add_channel': {
      const result = db.prepare(
        `INSERT INTO comms_channels (name, platform, webhook_url, config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        data.name,
        data.platform,
        data.webhook_url ?? '',
        JSON.stringify(data.config ?? {}),
        now,
        now,
      )
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'send_message': {
      const result = db.prepare(
        `INSERT INTO comms_messages (channel_id, direction, sender, content, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        data.channel_id,
        data.direction ?? 'inbound',
        data.sender ?? '',
        data.content,
        JSON.stringify(data.metadata ?? {}),
        now,
      )
      // Update channel message count and last_message_at
      db.prepare(
        `UPDATE comms_channels
         SET message_count = message_count + 1, last_message_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(now, now, data.channel_id)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/communications
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, patchBodySchema)
  if ('error' in validated) return validated.error

  try {
    ensureTables()
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)
    const data = validated.data

    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status) }
    if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name) }
    if (data.webhook_url !== undefined) { sets.push('webhook_url = ?'); params.push(data.webhook_url) }
    if (data.config !== undefined) { sets.push('config_json = ?'); params.push(JSON.stringify(data.config)) }

    params.push(data.id)
    db.prepare(`UPDATE comms_channels SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'Communications PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/communications
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, deleteBodySchema)
  if ('error' in validated) return validated.error

  try {
    ensureTables()
    const db = getDatabase()
    const table = validated.data.entity === 'channel' ? 'comms_channels' : 'comms_messages'
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(validated.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'Communications DELETE failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
