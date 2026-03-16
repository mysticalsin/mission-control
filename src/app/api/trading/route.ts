import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { validateBody } from '@/lib/validation'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getDatabase } from '@/lib/db'

// ---------------------------------------------------------------------------
// Lazy table creation -- idempotent, runs once per process
// ---------------------------------------------------------------------------

let tablesEnsured = false

function ensureTables(): void {
  if (tablesEnsured) return
  const db = getDatabase()

  db.exec(`
    CREATE TABLE IF NOT EXISTS trading_portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      current_price REAL NOT NULL DEFAULT 0,
      sector TEXT NOT NULL DEFAULT '',
      notes TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS trading_watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      price_alert_above REAL DEFAULT NULL,
      price_alert_below REAL DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS trading_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      sentiment TEXT NOT NULL DEFAULT 'neutral',
      confidence INTEGER NOT NULL DEFAULT 50,
      reasoning TEXT NOT NULL DEFAULT '',
      sources_json TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const addHoldingSchema = z.object({
  action: z.literal('add_holding'),
  symbol: z.string().min(1).max(10).toUpperCase(),
  name: z.string().min(1).max(200),
  quantity: z.number().positive(),
  avg_cost: z.number().min(0),
  current_price: z.number().min(0),
  sector: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
})

const addWatchSchema = z.object({
  action: z.literal('add_watch'),
  symbol: z.string().min(1).max(10).toUpperCase(),
  name: z.string().min(1).max(200),
  price_alert_above: z.number().min(0).optional(),
  price_alert_below: z.number().min(0).optional(),
  notes: z.string().max(5000).optional(),
})

const addIntelSchema = z.object({
  action: z.literal('add_intel'),
  symbol: z.string().min(1).max(10).toUpperCase(),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string().min(1).max(10000),
  sources: z.array(z.string().max(500)).max(20).optional(),
})

const postBodySchema = z.discriminatedUnion('action', [
  addHoldingSchema,
  addWatchSchema,
  addIntelSchema,
])

const patchHoldingSchema = z.object({
  target: z.literal('holding'),
  id: z.number().int().positive(),
  quantity: z.number().positive().optional(),
  avg_cost: z.number().min(0).optional(),
  current_price: z.number().min(0).optional(),
  sector: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
})

const patchWatchSchema = z.object({
  target: z.literal('watch'),
  id: z.number().int().positive(),
  price_alert_above: z.number().min(0).nullable().optional(),
  price_alert_below: z.number().min(0).nullable().optional(),
  notes: z.string().max(5000).optional(),
})

const patchBodySchema = z.discriminatedUnion('target', [
  patchHoldingSchema,
  patchWatchSchema,
])

const deleteBodySchema = z.object({
  target: z.enum(['holding', 'watch']),
  id: z.number().int().positive(),
})

// ---------------------------------------------------------------------------
// GET /api/trading?tab=portfolio|watchlist|intel
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'portfolio'

  try {
    ensureTables()
    const db = getDatabase()

    if (tab === 'portfolio') return handleGetPortfolio(db)
    if (tab === 'watchlist') return handleGetWatchlist(db)
    if (tab === 'intel') return handleGetIntel(db, searchParams)

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Trading GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetPortfolio(db: ReturnType<typeof getDatabase>): NextResponse {
  const holdings = db.prepare(
    `SELECT id, symbol, name, quantity, avg_cost, current_price, sector, notes,
            created_at, updated_at
     FROM trading_portfolio
     ORDER BY (quantity * current_price) DESC
     LIMIT 200`,
  ).all() as PortfolioRow[]

  const totalValue = holdings.reduce((sum, h) => sum + h.quantity * h.current_price, 0)
  const totalCost = holdings.reduce((sum, h) => sum + h.quantity * h.avg_cost, 0)

  // Sector allocation for pie chart
  const sectorMap = new Map<string, number>()
  for (const h of holdings) {
    const sector = h.sector || 'Other'
    const value = h.quantity * h.current_price
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + value)
  }
  const sectors = Array.from(sectorMap, ([name, value]) => ({ name, value }))

  return NextResponse.json({
    holdings,
    summary: { totalValue, totalCost, totalGainLoss: totalValue - totalCost },
    sectors,
  })
}

interface PortfolioRow {
  id: number; symbol: string; name: string; quantity: number
  avg_cost: number; current_price: number; sector: string
  notes: string; created_at: number; updated_at: number
}

function handleGetWatchlist(db: ReturnType<typeof getDatabase>): NextResponse {
  const items = db.prepare(
    `SELECT id, symbol, name, price_alert_above, price_alert_below, notes, created_at
     FROM trading_watchlist
     ORDER BY created_at DESC
     LIMIT 200`,
  ).all()

  return NextResponse.json({ items })
}

function handleGetIntel(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const symbol = params.get('symbol')
  let query = `SELECT id, symbol, sentiment, confidence, reasoning, sources_json, created_at
               FROM trading_intel WHERE 1=1`
  const queryParams: unknown[] = []

  if (symbol) {
    query += ' AND symbol = ?'
    queryParams.push(symbol.toUpperCase())
  }

  query += ' ORDER BY created_at DESC LIMIT 100'
  const intel = db.prepare(query).all(...queryParams)
  return NextResponse.json({ intel })
}

// ---------------------------------------------------------------------------
// POST /api/trading
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
    logger.error({ err: error }, 'Trading POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PostAction = z.infer<typeof postBodySchema>

function dispatchPostAction(data: PostAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.action) {
    case 'add_holding': {
      const result = db.prepare(
        `INSERT INTO trading_portfolio
         (symbol, name, quantity, avg_cost, current_price, sector, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        data.symbol, data.name, data.quantity, data.avg_cost,
        data.current_price, data.sector ?? '', data.notes ?? '', now, now,
      )
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'add_watch': {
      const result = db.prepare(
        `INSERT INTO trading_watchlist
         (symbol, name, price_alert_above, price_alert_below, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        data.symbol, data.name,
        data.price_alert_above ?? null, data.price_alert_below ?? null,
        data.notes ?? '', now,
      )
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'add_intel': {
      const result = db.prepare(
        `INSERT INTO trading_intel
         (symbol, sentiment, confidence, reasoning, sources_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        data.symbol, data.sentiment, data.confidence,
        data.reasoning, JSON.stringify(data.sources ?? []), now,
      )
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/trading
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
    logger.error({ err: error }, 'Trading PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PatchAction = z.infer<typeof patchBodySchema>

function dispatchPatchAction(data: PatchAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.target) {
    case 'holding': {
      const sets: string[] = ['updated_at = ?']
      const params: unknown[] = [now]
      if (data.quantity !== undefined) { sets.push('quantity = ?'); params.push(data.quantity) }
      if (data.avg_cost !== undefined) { sets.push('avg_cost = ?'); params.push(data.avg_cost) }
      if (data.current_price !== undefined) { sets.push('current_price = ?'); params.push(data.current_price) }
      if (data.sector !== undefined) { sets.push('sector = ?'); params.push(data.sector) }
      if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes) }
      params.push(data.id)
      db.prepare(`UPDATE trading_portfolio SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return NextResponse.json({ ok: true })
    }
    case 'watch': {
      const sets: string[] = []
      const params: unknown[] = []
      if (data.price_alert_above !== undefined) { sets.push('price_alert_above = ?'); params.push(data.price_alert_above) }
      if (data.price_alert_below !== undefined) { sets.push('price_alert_below = ?'); params.push(data.price_alert_below) }
      if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes) }
      if (sets.length === 0) return NextResponse.json({ ok: true })
      params.push(data.id)
      db.prepare(`UPDATE trading_watchlist SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return NextResponse.json({ ok: true })
    }
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/trading
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
    const table = validated.data.target === 'holding' ? 'trading_portfolio' : 'trading_watchlist'
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(validated.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'Trading DELETE failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
