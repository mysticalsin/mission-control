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
    CREATE TABLE IF NOT EXISTS health_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_type TEXT NOT NULL CHECK(metric_type IN (
        'weight','bp_systolic','bp_diastolic','heart_rate','steps','sleep_hours','calories','mood'
      )),
      value REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      notes TEXT DEFAULT '',
      recorded_at INTEGER NOT NULL DEFAULT (unixepoch()),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS health_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_type TEXT NOT NULL,
      target_value REAL NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      deadline TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','achieved','missed')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const METRIC_TYPES = [
  'weight', 'bp_systolic', 'bp_diastolic', 'heart_rate',
  'steps', 'sleep_hours', 'calories', 'mood',
] as const

type MetricType = typeof METRIC_TYPES[number]

const recordMetricSchema = z.object({
  action: z.literal('record_metric'),
  metric_type: z.enum(METRIC_TYPES),
  value: z.number().finite(),
  unit: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  recorded_at: z.number().int().optional(),
})

const createGoalSchema = z.object({
  action: z.literal('create_goal'),
  metric_type: z.enum(METRIC_TYPES),
  target_value: z.number().finite(),
  current_value: z.number().finite().optional(),
  deadline: z.string().max(20).optional(),
})

const postBodySchema = z.discriminatedUnion('action', [
  recordMetricSchema,
  createGoalSchema,
])

const patchBodySchema = z.object({
  target: z.enum(['goal']),
  id: z.number().int().positive(),
  current_value: z.number().finite().optional(),
  status: z.enum(['active', 'achieved', 'missed']).optional(),
  deadline: z.string().max(20).optional(),
})

const deleteBodySchema = z.object({
  target: z.enum(['metric', 'goal']),
  id: z.number().int().positive(),
})

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface MetricRow {
  id: number; metric_type: MetricType; value: number; unit: string
  notes: string; recorded_at: number; created_at: number
}

interface GoalRow {
  id: number; metric_type: string; target_value: number; current_value: number
  deadline: string | null; status: string; created_at: number; updated_at: number
}

interface LatestMetricRow { metric_type: MetricType; value: number; recorded_at: number }

// Default units per metric type — documents expected unit for consumers
const DEFAULT_UNITS: Record<MetricType, string> = {
  weight: 'kg', bp_systolic: 'mmHg', bp_diastolic: 'mmHg', heart_rate: 'bpm',
  steps: 'steps', sleep_hours: 'h', calories: 'kcal', mood: '/10',
}

// ---------------------------------------------------------------------------
// GET /api/health-tracker?tab=metrics|goals|dashboard
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') ?? 'dashboard'

  try {
    ensureTables()
    const db = getDatabase()

    if (tab === 'metrics') return handleGetMetrics(db, searchParams)
    if (tab === 'goals') return handleGetGoals(db)
    if (tab === 'dashboard') return handleGetDashboard(db)

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'HealthTracker GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetMetrics(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const type = params.get('type')
  let query = `SELECT id, metric_type, value, unit, notes, recorded_at, created_at
               FROM health_metrics WHERE 1=1`
  const args: unknown[] = []

  if (type && METRIC_TYPES.includes(type as MetricType)) {
    query += ' AND metric_type = ?'
    args.push(type)
  }

  query += ' ORDER BY recorded_at DESC LIMIT 500'
  const metrics = db.prepare(query).all(...args) as MetricRow[]
  return NextResponse.json({ metrics })
}

function handleGetGoals(db: ReturnType<typeof getDatabase>): NextResponse {
  const goals = db.prepare(
    `SELECT id, metric_type, target_value, current_value, deadline, status, created_at, updated_at
     FROM health_goals
     ORDER BY status ASC, created_at DESC
     LIMIT 100`,
  ).all() as GoalRow[]
  return NextResponse.json({ goals })
}

function handleGetDashboard(db: ReturnType<typeof getDatabase>): NextResponse {
  // Latest reading per metric type
  const latest = db.prepare(
    `SELECT metric_type, value, recorded_at
     FROM health_metrics
     WHERE id IN (
       SELECT id FROM health_metrics m2
       WHERE m2.metric_type = health_metrics.metric_type
       ORDER BY recorded_at DESC LIMIT 1
     )`,
  ).all() as LatestMetricRow[]

  // 7-day weekly trend: one row per day per type
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400
  const trends = db.prepare(
    `SELECT metric_type,
            DATE(recorded_at, 'unixepoch') AS day,
            AVG(value) AS avg_value,
            COUNT(*) AS count
     FROM health_metrics
     WHERE recorded_at >= ?
     GROUP BY metric_type, day
     ORDER BY metric_type, day ASC`,
  ).all(sevenDaysAgo) as Array<{
    metric_type: MetricType; day: string; avg_value: number; count: number
  }>

  return NextResponse.json({ latest, trends, defaultUnits: DEFAULT_UNITS })
}

// ---------------------------------------------------------------------------
// POST /api/health-tracker
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
    logger.error({ err: error }, 'HealthTracker POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PostAction = z.infer<typeof postBodySchema>

function dispatchPostAction(data: PostAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.action) {
    case 'record_metric': {
      const result = db.prepare(
        `INSERT INTO health_metrics (metric_type, value, unit, notes, recorded_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        data.metric_type,
        data.value,
        data.unit ?? DEFAULT_UNITS[data.metric_type],
        data.notes ?? '',
        data.recorded_at ?? now,
        now,
      )
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'create_goal': {
      const result = db.prepare(
        `INSERT INTO health_goals (metric_type, target_value, current_value, deadline, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        data.metric_type,
        data.target_value,
        data.current_value ?? 0,
        data.deadline ?? null,
        now,
        now,
      )
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/health-tracker
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
    const { id, current_value, status, deadline } = validated.data

    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (current_value !== undefined) { sets.push('current_value = ?'); params.push(current_value) }
    if (status !== undefined) { sets.push('status = ?'); params.push(status) }
    if (deadline !== undefined) { sets.push('deadline = ?'); params.push(deadline) }

    params.push(id)
    db.prepare(`UPDATE health_goals SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'HealthTracker PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/health-tracker
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
    const table = validated.data.target === 'metric' ? 'health_metrics' : 'health_goals'
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(validated.data.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'HealthTracker DELETE failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
