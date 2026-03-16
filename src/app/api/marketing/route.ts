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
    CREATE TABLE IF NOT EXISTS marketing_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      source TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS marketing_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 50,
      source_url TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'email',
      status TEXT NOT NULL DEFAULT 'draft',
      budget REAL NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      leads_generated INTEGER NOT NULL DEFAULT 0,
      conversion_rate REAL NOT NULL DEFAULT 0,
      start_date TEXT DEFAULT NULL,
      end_date TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS marketing_presentations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      slide_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'generating',
      content_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  // Phase 1 enrichment: AI lead qualification columns
  const cols = db.prepare("PRAGMA table_info(marketing_leads)").all() as Array<{ name: string }>
  const colNames = new Set(cols.map(c => c.name))
  if (!colNames.has('vibe_score')) {
    db.exec(`ALTER TABLE marketing_leads ADD COLUMN vibe_score INTEGER DEFAULT NULL`)
  }
  if (!colNames.has('qualification_reasoning')) {
    db.exec(`ALTER TABLE marketing_leads ADD COLUMN qualification_reasoning TEXT DEFAULT ''`)
  }
  if (!colNames.has('ai_qualified')) {
    db.exec(`ALTER TABLE marketing_leads ADD COLUMN ai_qualified INTEGER DEFAULT 0`)
  }

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createLeadSchema = z.object({
  action: z.literal('create_lead'),
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  email: z.string().email().max(300).optional(),
  source: z.string().max(200).optional(),
  score: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(5000).optional(),
})

const createCampaignSchema = z.object({
  action: z.literal('create_campaign'),
  name: z.string().min(1).max(200),
  type: z.enum(['email', 'social', 'content', 'event']),
  budget: z.number().min(0).optional(),
  start_date: z.string().max(30).optional(),
  end_date: z.string().max(30).optional(),
})

const createPresentationSchema = z.object({
  action: z.literal('create_presentation'),
  title: z.string().min(1).max(300),
  topic: z.string().min(1).max(1000),
  slide_count: z.number().int().min(1).max(100).optional(),
})

const qualifyLeadSchema = z.object({
  action: z.literal('qualify_lead'),
  id: z.number().int().positive(),
  vibe_score: z.number().int().min(0).max(100),
  reasoning: z.string().max(2000),
})

const postBodySchema = z.discriminatedUnion('action', [
  createLeadSchema,
  createCampaignSchema,
  createPresentationSchema,
  qualifyLeadSchema,
])

const patchLeadSchema = z.object({
  target: z.literal('lead'),
  id: z.number().int().positive(),
  status: z.enum(['new', 'contacted', 'qualified', 'converted']).optional(),
  score: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(5000).optional(),
})

const patchCampaignSchema = z.object({
  target: z.literal('campaign'),
  id: z.number().int().positive(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  spent: z.number().min(0).optional(),
  leads_generated: z.number().int().min(0).optional(),
  conversion_rate: z.number().min(0).max(100).optional(),
})

const patchBodySchema = z.discriminatedUnion('target', [
  patchLeadSchema,
  patchCampaignSchema,
])

// ---------------------------------------------------------------------------
// GET /api/marketing?tab=leads|signals|campaigns|presentations
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'leads'

  try {
    ensureTables()
    const db = getDatabase()

    if (tab === 'leads') return handleGetLeads(db, searchParams)
    if (tab === 'signals') return handleGetSignals(db, searchParams)
    if (tab === 'campaigns') return handleGetCampaigns(db)
    if (tab === 'presentations') return handleGetPresentations(db)
    if (tab === 'funnel') return handleGetFunnel(db)

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Marketing GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetLeads(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const status = params.get('status')
  const search = params.get('search')
  const sortBy = params.get('sort') || 'created_at'
  const order = params.get('order') === 'asc' ? 'ASC' : 'DESC'

  // Whitelist sort columns to prevent injection
  const allowedSorts = ['score', 'created_at', 'name', 'company']
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at'

  let query = 'SELECT id, name, company, email, status, source, score, notes, created_at, updated_at FROM marketing_leads WHERE 1=1'
  const queryParams: unknown[] = []

  if (status) {
    query += ' AND status = ?'
    queryParams.push(status)
  }
  if (search) {
    query += ' AND (name LIKE ? OR company LIKE ? OR email LIKE ?)'
    const like = `%${search}%`
    queryParams.push(like, like, like)
  }

  query += ` ORDER BY ${safeSort} ${order} LIMIT 200`

  const leads = db.prepare(query).all(...queryParams)
  return NextResponse.json({ leads })
}

function handleGetSignals(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const signalType = params.get('signal_type')
  let query = 'SELECT id, signal_type, company, description, confidence, source_url, created_at FROM marketing_signals WHERE 1=1'
  const queryParams: unknown[] = []

  if (signalType) {
    query += ' AND signal_type = ?'
    queryParams.push(signalType)
  }

  query += ' ORDER BY created_at DESC LIMIT 100'
  const signals = db.prepare(query).all(...queryParams)
  return NextResponse.json({ signals })
}

function handleGetCampaigns(db: ReturnType<typeof getDatabase>): NextResponse {
  const campaigns = db.prepare(
    'SELECT id, name, type, status, budget, spent, leads_generated, conversion_rate, start_date, end_date, created_at, updated_at FROM marketing_campaigns ORDER BY created_at DESC LIMIT 100',
  ).all()
  return NextResponse.json({ campaigns })
}

function handleGetPresentations(db: ReturnType<typeof getDatabase>): NextResponse {
  const presentations = db.prepare(
    'SELECT id, title, topic, slide_count, status, created_at FROM marketing_presentations ORDER BY created_at DESC LIMIT 100',
  ).all()
  return NextResponse.json({ presentations })
}

function handleGetFunnel(db: ReturnType<typeof getDatabase>): NextResponse {
  const rows = db.prepare(
    'SELECT status, COUNT(*) as count FROM marketing_leads GROUP BY status',
  ).all() as Array<{ status: string; count: number }>

  const funnel = {
    new: 0, contacted: 0, qualified: 0, converted: 0,
  }
  for (const row of rows) {
    if (row.status in funnel) {
      funnel[row.status as keyof typeof funnel] = row.count
    }
  }
  return NextResponse.json({ funnel })
}

// ---------------------------------------------------------------------------
// POST /api/marketing
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
    logger.error({ err: error }, 'Marketing POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PostAction = z.infer<typeof postBodySchema>

function dispatchPostAction(data: PostAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.action) {
    case 'create_lead': {
      const result = db.prepare(
        'INSERT INTO marketing_leads (name, company, email, source, score, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(data.name, data.company ?? '', data.email ?? '', data.source ?? '', data.score ?? 0, data.notes ?? '', now, now)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'create_campaign': {
      const result = db.prepare(
        'INSERT INTO marketing_campaigns (name, type, budget, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(data.name, data.type, data.budget ?? 0, data.start_date ?? null, data.end_date ?? null, now, now)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'create_presentation': {
      const result = db.prepare(
        'INSERT INTO marketing_presentations (title, topic, slide_count, status, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(data.title, data.topic, data.slide_count ?? 10, 'generating', now)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'qualify_lead': {
      // AI lead qualification — sets vibe score and reasoning
      db.prepare(
        'UPDATE marketing_leads SET vibe_score = ?, qualification_reasoning = ?, ai_qualified = 1, status = ?, updated_at = ? WHERE id = ?',
      ).run(data.vibe_score, data.reasoning, data.vibe_score >= 70 ? 'qualified' : 'contacted', now, data.id)
      return NextResponse.json({ ok: true, qualified: data.vibe_score >= 70 })
    }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/marketing
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
    logger.error({ err: error }, 'Marketing PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PatchAction = z.infer<typeof patchBodySchema>

function dispatchPatchAction(data: PatchAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.target) {
    case 'lead': {
      const sets: string[] = ['updated_at = ?']
      const params: unknown[] = [now]
      if (data.status) { sets.push('status = ?'); params.push(data.status) }
      if (data.score !== undefined) { sets.push('score = ?'); params.push(data.score) }
      if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes) }
      params.push(data.id)
      db.prepare(`UPDATE marketing_leads SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return NextResponse.json({ ok: true })
    }
    case 'campaign': {
      const sets: string[] = ['updated_at = ?']
      const params: unknown[] = [now]
      if (data.status) { sets.push('status = ?'); params.push(data.status) }
      if (data.spent !== undefined) { sets.push('spent = ?'); params.push(data.spent) }
      if (data.leads_generated !== undefined) { sets.push('leads_generated = ?'); params.push(data.leads_generated) }
      if (data.conversion_rate !== undefined) { sets.push('conversion_rate = ?'); params.push(data.conversion_rate) }
      params.push(data.id)
      db.prepare(`UPDATE marketing_campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return NextResponse.json({ ok: true })
    }
  }
}

export const dynamic = 'force-dynamic'
