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
    CREATE TABLE IF NOT EXISTS sales_deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      contact_name TEXT DEFAULT '',
      contact_email TEXT DEFAULT '',
      deal_value REAL DEFAULT 0,
      stage TEXT DEFAULT 'prospecting' CHECK(stage IN ('prospecting','qualification','proposal','negotiation','closed_won','closed_lost')),
      probability INTEGER DEFAULT 10,
      next_action TEXT DEFAULT '',
      next_action_date TEXT,
      risk_level TEXT DEFAULT 'low' CHECK(risk_level IN ('low','medium','high')),
      notes TEXT DEFAULT '',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sales_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER REFERENCES sales_deals(id),
      activity_type TEXT NOT NULL CHECK(activity_type IN ('call','email','meeting','note','demo','proposal')),
      description TEXT DEFAULT '',
      outcome TEXT DEFAULT '',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sales_briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      briefing_type TEXT DEFAULT 'daily' CHECK(briefing_type IN ('daily','weekly','deal_specific')),
      deals_referenced TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (unixepoch())
    );
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createDealSchema = z.object({
  action: z.literal('create_deal'),
  company: z.string().min(1).max(200),
  contact_name: z.string().max(200).optional(),
  contact_email: z.string().email().max(300).optional(),
  deal_value: z.number().min(0).optional(),
  stage: z.enum(['prospecting','qualification','proposal','negotiation','closed_won','closed_lost']).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  next_action: z.string().max(500).optional(),
  next_action_date: z.string().max(30).optional(),
  risk_level: z.enum(['low','medium','high']).optional(),
  notes: z.string().max(5000).optional(),
})

const logActivitySchema = z.object({
  action: z.literal('log_activity'),
  deal_id: z.number().int().positive(),
  activity_type: z.enum(['call','email','meeting','note','demo','proposal']),
  description: z.string().max(2000).optional(),
  outcome: z.string().max(2000).optional(),
})

const generateBriefingSchema = z.object({
  action: z.literal('generate_briefing'),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(10000),
  briefing_type: z.enum(['daily','weekly','deal_specific']).optional(),
  deals_referenced: z.array(z.number().int().positive()).optional(),
})

const postBodySchema = z.discriminatedUnion('action', [
  createDealSchema,
  logActivitySchema,
  generateBriefingSchema,
])

const patchBodySchema = z.object({
  id: z.number().int().positive(),
  stage: z.enum(['prospecting','qualification','proposal','negotiation','closed_won','closed_lost']).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  next_action: z.string().max(500).optional(),
  next_action_date: z.string().max(30).optional(),
  risk_level: z.enum(['low','medium','high']).optional(),
  notes: z.string().max(5000).optional(),
})

const deleteBodySchema = z.object({
  entity: z.enum(['deal','activity','briefing']),
  id: z.number().int().positive(),
})

// ---------------------------------------------------------------------------
// GET /api/sales-assistant?tab=deals|activities|briefings|pipeline
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'deals'

  try {
    ensureTables()
    const db = getDatabase()

    if (tab === 'deals') return handleGetDeals(db)
    if (tab === 'activities') return handleGetActivities(db)
    if (tab === 'briefings') return handleGetBriefings(db)
    if (tab === 'pipeline') return handleGetPipeline(db)

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Sales assistant GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetDeals(db: ReturnType<typeof getDatabase>): NextResponse {
  const deals = db.prepare(
    'SELECT id, company, contact_name, contact_email, deal_value, stage, probability, next_action, next_action_date, risk_level, notes, created_at, updated_at FROM sales_deals ORDER BY updated_at DESC LIMIT 200',
  ).all()
  return NextResponse.json({ deals })
}

function handleGetActivities(db: ReturnType<typeof getDatabase>): NextResponse {
  const activities = db.prepare(
    'SELECT a.id, a.deal_id, a.activity_type, a.description, a.outcome, a.created_at, d.company FROM sales_activities a LEFT JOIN sales_deals d ON a.deal_id = d.id ORDER BY a.created_at DESC LIMIT 100',
  ).all()
  return NextResponse.json({ activities })
}

function handleGetBriefings(db: ReturnType<typeof getDatabase>): NextResponse {
  const briefings = db.prepare(
    'SELECT id, title, content, briefing_type, deals_referenced, created_at FROM sales_briefings ORDER BY created_at DESC LIMIT 50',
  ).all()
  return NextResponse.json({ briefings })
}

function handleGetPipeline(db: ReturnType<typeof getDatabase>): NextResponse {
  const rows = db.prepare(
    'SELECT stage, COUNT(*) as count, SUM(deal_value) as total_value FROM sales_deals GROUP BY stage',
  ).all() as Array<{ stage: string; count: number; total_value: number }>

  const stages = ['prospecting','qualification','proposal','negotiation','closed_won','closed_lost']
  const pipeline = stages.map(stage => {
    const row = rows.find(r => r.stage === stage)
    return { stage, count: row?.count ?? 0, total_value: row?.total_value ?? 0 }
  })

  const totalValue = pipeline
    .filter(s => s.stage !== 'closed_lost')
    .reduce((sum, s) => sum + s.total_value, 0)

  return NextResponse.json({ pipeline, totalValue })
}

// ---------------------------------------------------------------------------
// POST /api/sales-assistant
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
    logger.error({ err: error }, 'Sales assistant POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PostAction = z.infer<typeof postBodySchema>

function dispatchPostAction(data: PostAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.action) {
    case 'create_deal': {
      const result = db.prepare(
        'INSERT INTO sales_deals (company, contact_name, contact_email, deal_value, stage, probability, next_action, next_action_date, risk_level, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        data.company, data.contact_name ?? '', data.contact_email ?? '',
        data.deal_value ?? 0, data.stage ?? 'prospecting', data.probability ?? 10,
        data.next_action ?? '', data.next_action_date ?? null,
        data.risk_level ?? 'low', data.notes ?? '', now, now,
      )
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'log_activity': {
      const result = db.prepare(
        'INSERT INTO sales_activities (deal_id, activity_type, description, outcome, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(data.deal_id, data.activity_type, data.description ?? '', data.outcome ?? '', now)
      // Update deal's updated_at so it surfaces in recent activity
      db.prepare('UPDATE sales_deals SET updated_at = ? WHERE id = ?').run(now, data.deal_id)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'generate_briefing': {
      const dealsRef = JSON.stringify(data.deals_referenced ?? [])
      const result = db.prepare(
        'INSERT INTO sales_briefings (title, content, briefing_type, deals_referenced, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(data.title, data.content, data.briefing_type ?? 'daily', dealsRef, now)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/sales-assistant — update deal fields
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
    if (data.stage !== undefined) { sets.push('stage = ?'); params.push(data.stage) }
    if (data.probability !== undefined) { sets.push('probability = ?'); params.push(data.probability) }
    if (data.next_action !== undefined) { sets.push('next_action = ?'); params.push(data.next_action) }
    if (data.next_action_date !== undefined) { sets.push('next_action_date = ?'); params.push(data.next_action_date) }
    if (data.risk_level !== undefined) { sets.push('risk_level = ?'); params.push(data.risk_level) }
    if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes) }
    params.push(data.id)

    db.prepare(`UPDATE sales_deals SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'Sales assistant PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/sales-assistant
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
    const tableMap = { deal: 'sales_deals', activity: 'sales_activities', briefing: 'sales_briefings' }
    db.prepare(`DELETE FROM ${tableMap[validated.data.entity]} WHERE id = ?`).run(validated.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'Sales assistant DELETE failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
