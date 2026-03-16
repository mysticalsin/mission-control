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
    CREATE TABLE IF NOT EXISTS outreach_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'email',
      status TEXT NOT NULL DEFAULT 'draft',
      total_contacts INTEGER NOT NULL DEFAULT 0,
      contacted INTEGER NOT NULL DEFAULT 0,
      replied INTEGER NOT NULL DEFAULT 0,
      meetings_booked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS outreach_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      last_contact_at INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (campaign_id) REFERENCES outreach_campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS outreach_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      variables_json TEXT NOT NULL DEFAULT '[]',
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createCampaignSchema = z.object({
  action: z.literal('create_campaign'),
  name: z.string().min(1).max(200),
  type: z.enum(['email', 'linkedin', 'call', 'multi']),
})

const addContactSchema = z.object({
  action: z.literal('add_contact'),
  campaign_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  email: z.string().email().max(300).optional(),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
})

const createTemplateSchema = z.object({
  action: z.literal('create_template'),
  name: z.string().min(1).max(200),
  channel: z.enum(['email', 'linkedin', 'call']),
  subject: z.string().max(500).optional(),
  body: z.string().min(1).max(20000),
  variables: z.array(z.string().max(100)).max(50).optional(),
})

const postBodySchema = z.discriminatedUnion('action', [
  createCampaignSchema,
  addContactSchema,
  createTemplateSchema,
])

const patchCampaignSchema = z.object({
  target: z.literal('campaign'),
  id: z.number().int().positive(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  contacted: z.number().int().min(0).optional(),
  replied: z.number().int().min(0).optional(),
  meetings_booked: z.number().int().min(0).optional(),
})

const patchContactSchema = z.object({
  target: z.literal('contact'),
  id: z.number().int().positive(),
  status: z.enum(['pending', 'contacted', 'replied', 'meeting', 'converted', 'rejected']).optional(),
  notes: z.string().max(5000).optional(),
})

const patchBodySchema = z.discriminatedUnion('target', [
  patchCampaignSchema,
  patchContactSchema,
])

const deleteBodySchema = z.object({
  target: z.enum(['campaign', 'contact', 'template']),
  id: z.number().int().positive(),
})

// ---------------------------------------------------------------------------
// GET /api/outreach?tab=campaigns|contacts|templates
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'campaigns'

  try {
    ensureTables()
    const db = getDatabase()

    if (tab === 'campaigns') return handleGetCampaigns(db)
    if (tab === 'contacts') return handleGetContacts(db, searchParams)
    if (tab === 'templates') return handleGetTemplates(db, searchParams)

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Outreach GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetCampaigns(db: ReturnType<typeof getDatabase>): NextResponse {
  const campaigns = db.prepare(
    `SELECT id, name, type, status, total_contacts, contacted, replied,
            meetings_booked, created_at, updated_at
     FROM outreach_campaigns
     ORDER BY created_at DESC
     LIMIT 200`,
  ).all()
  return NextResponse.json({ campaigns })
}

function handleGetContacts(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const campaignId = params.get('campaign_id')
  const status = params.get('status')

  let query = `SELECT id, campaign_id, name, email, company, title, status,
                      last_contact_at, notes, created_at
               FROM outreach_contacts WHERE 1=1`
  const queryParams: unknown[] = []

  // Filter by campaign when provided — avoids returning all contacts globally
  if (campaignId) {
    query += ' AND campaign_id = ?'
    queryParams.push(Number(campaignId))
  }
  if (status) {
    query += ' AND status = ?'
    queryParams.push(status)
  }

  query += ' ORDER BY created_at DESC LIMIT 500'
  const contacts = db.prepare(query).all(...queryParams)
  return NextResponse.json({ contacts })
}

function handleGetTemplates(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const channel = params.get('channel')

  let query = `SELECT id, name, channel, subject, body, variables_json,
                      usage_count, created_at
               FROM outreach_templates WHERE 1=1`
  const queryParams: unknown[] = []

  if (channel) {
    query += ' AND channel = ?'
    queryParams.push(channel)
  }

  query += ' ORDER BY usage_count DESC, created_at DESC LIMIT 100'
  const templates = db.prepare(query).all(...queryParams)
  return NextResponse.json({ templates })
}

// ---------------------------------------------------------------------------
// POST /api/outreach
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
    logger.error({ err: error }, 'Outreach POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PostAction = z.infer<typeof postBodySchema>

function dispatchPostAction(data: PostAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.action) {
    case 'create_campaign': {
      const result = db.prepare(
        `INSERT INTO outreach_campaigns (name, type, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).run(data.name, data.type, now, now)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'add_contact': {
      const result = db.prepare(
        `INSERT INTO outreach_contacts
         (campaign_id, name, email, company, title, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        data.campaign_id, data.name, data.email ?? '',
        data.company ?? '', data.title ?? '', data.notes ?? '', now,
      )
      // Increment the campaign's total_contacts counter to keep denormalized stat fresh
      db.prepare(
        `UPDATE outreach_campaigns
         SET total_contacts = total_contacts + 1, updated_at = ?
         WHERE id = ?`,
      ).run(now, data.campaign_id)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'create_template': {
      const result = db.prepare(
        `INSERT INTO outreach_templates
         (name, channel, subject, body, variables_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        data.name, data.channel, data.subject ?? '',
        data.body, JSON.stringify(data.variables ?? []), now,
      )
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/outreach
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
    return dispatchPatchAction(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'Outreach PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PatchAction = z.infer<typeof patchBodySchema>

function dispatchPatchAction(data: PatchAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.target) {
    case 'campaign': {
      const sets: string[] = ['updated_at = ?']
      const params: unknown[] = [now]
      if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status) }
      if (data.contacted !== undefined) { sets.push('contacted = ?'); params.push(data.contacted) }
      if (data.replied !== undefined) { sets.push('replied = ?'); params.push(data.replied) }
      if (data.meetings_booked !== undefined) { sets.push('meetings_booked = ?'); params.push(data.meetings_booked) }
      params.push(data.id)
      db.prepare(`UPDATE outreach_campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return NextResponse.json({ ok: true })
    }
    case 'contact': {
      const sets: string[] = []
      const params: unknown[] = []
      if (data.status !== undefined) {
        sets.push('status = ?')
        params.push(data.status)
        // Record when the contact was last touched so we can show staleness
        sets.push('last_contact_at = ?')
        params.push(now)
      }
      if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes) }
      if (sets.length === 0) return NextResponse.json({ ok: true })
      params.push(data.id)
      db.prepare(`UPDATE outreach_contacts SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return NextResponse.json({ ok: true })
    }
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/outreach
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
    const tableMap: Record<string, string> = {
      campaign: 'outreach_campaigns',
      contact: 'outreach_contacts',
      template: 'outreach_templates',
    }
    const table = tableMap[validated.data.target]
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(validated.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'Outreach DELETE failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
