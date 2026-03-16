import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { validateBody } from '@/lib/validation'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getDatabase } from '@/lib/db'
import { selfHealingEngine } from '@/lib/self-healing'

// ---------------------------------------------------------------------------
// Lazy table creation — idempotent, runs once per process
// ---------------------------------------------------------------------------

let tablesEnsured = false

function ensureTables(): void {
  if (tablesEnsured) return
  const db = getDatabase()

  db.exec(`
    CREATE TABLE IF NOT EXISTS healer_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_type TEXT NOT NULL DEFAULT 'full' CHECK(scan_type IN ('full','quick','targeted')),
      status TEXT DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
      issues_found INTEGER DEFAULT 0,
      issues_fixed INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      report_json TEXT DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS healer_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL CHECK(event_type IN ('circuit_open','circuit_close','recovery','degradation','vacuum','config_change')),
      component TEXT NOT NULL DEFAULT '',
      severity TEXT DEFAULT 'info' CHECK(severity IN ('info','warning','error','critical')),
      message TEXT NOT NULL DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS healer_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component TEXT NOT NULL UNIQUE,
      enabled INTEGER DEFAULT 1,
      threshold INTEGER DEFAULT 3,
      cooldown_seconds INTEGER DEFAULT 60,
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const triggerScanSchema = z.object({
  action: z.literal('trigger_scan'),
  scan_type: z.enum(['full', 'quick', 'targeted']).optional(),
  component: z.string().max(200).optional(),
})

const vacuumSchema = z.object({
  action: z.literal('vacuum'),
})

const postBodySchema = z.discriminatedUnion('action', [
  triggerScanSchema,
  vacuumSchema,
])

const updateConfigSchema = z.object({
  component: z.string().min(1).max(200),
  enabled: z.boolean().optional(),
  threshold: z.number().int().min(1).max(100).optional(),
  cooldown_seconds: z.number().int().min(5).max(3600).optional(),
})

// ---------------------------------------------------------------------------
// GET /api/healer?tab=dashboard|scans|events|config
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'dashboard'

  try {
    ensureTables()
    const db = getDatabase()

    if (tab === 'dashboard') return handleGetDashboard(db)
    if (tab === 'scans') return handleGetScans(db, searchParams)
    if (tab === 'events') return handleGetEvents(db, searchParams)
    if (tab === 'config') return handleGetConfig(db)

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Healer GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetDashboard(db: ReturnType<typeof getDatabase>): NextResponse {
  const latestScan = db.prepare(
    'SELECT id, scan_type, status, issues_found, issues_fixed, duration_ms, report_json, created_at FROM healer_scans ORDER BY created_at DESC LIMIT 1',
  ).get()

  const recentEvents = db.prepare(
    'SELECT id, event_type, component, severity, message, metadata_json, created_at FROM healer_events ORDER BY created_at DESC LIMIT 20',
  ).all()

  // Pull live circuit breaker states from the engine
  const circuitBreakers = selfHealingEngine.getCircuitStates()
  const healthSummary = selfHealingEngine.getHealthSummary()

  return NextResponse.json({
    latestScan,
    recentEvents,
    circuitBreakers,
    overallStatus: healthSummary.overall,
    degradedServices: healthSummary.degradedServices,
    timestamp: healthSummary.timestamp,
  })
}

function handleGetScans(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const status = params.get('status')
  let query = 'SELECT id, scan_type, status, issues_found, issues_fixed, duration_ms, report_json, created_at FROM healer_scans WHERE 1=1'
  const queryParams: unknown[] = []

  if (status) {
    query += ' AND status = ?'
    queryParams.push(status)
  }

  query += ' ORDER BY created_at DESC LIMIT 100'
  const scans = db.prepare(query).all(...queryParams)
  return NextResponse.json({ scans })
}

function handleGetEvents(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const component = params.get('component')
  const severity = params.get('severity')
  let query = 'SELECT id, event_type, component, severity, message, metadata_json, created_at FROM healer_events WHERE 1=1'
  const queryParams: unknown[] = []

  if (component) {
    query += ' AND component = ?'
    queryParams.push(component)
  }
  if (severity) {
    query += ' AND severity = ?'
    queryParams.push(severity)
  }

  query += ' ORDER BY created_at DESC LIMIT 200'
  const events = db.prepare(query).all(...queryParams)
  return NextResponse.json({ events })
}

function handleGetConfig(db: ReturnType<typeof getDatabase>): NextResponse {
  const configs = db.prepare(
    'SELECT id, component, enabled, threshold, cooldown_seconds, updated_at FROM healer_config ORDER BY component ASC',
  ).all()
  return NextResponse.json({ configs })
}

// ---------------------------------------------------------------------------
// POST /api/healer
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  // Healing actions are sensitive — admin only
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, postBodySchema)
  if ('error' in validated) return validated.error

  try {
    ensureTables()
    return dispatchPostAction(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'Healer POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PostAction = z.infer<typeof postBodySchema>

function dispatchPostAction(data: PostAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.action) {
    case 'trigger_scan': {
      const scanType = data.scan_type ?? 'full'
      const result = db.prepare(
        'INSERT INTO healer_scans (scan_type, status, created_at) VALUES (?, ?, ?)',
      ).run(scanType, 'running', now)

      // Trigger live health check and update scan record
      const checks = selfHealingEngine.checkHealth()
      const issuesFound = checks.filter(c => c.status !== 'healthy').length
      const durationMs = Math.floor(Date.now() / 1000 - now) * 1000

      db.prepare(
        'UPDATE healer_scans SET status = ?, issues_found = ?, duration_ms = ?, report_json = ? WHERE id = ?',
      ).run('completed', issuesFound, durationMs, JSON.stringify({ checks }), result.lastInsertRowid)

      // Log scan event
      db.prepare(
        'INSERT INTO healer_events (event_type, component, severity, message, metadata_json, created_at) VALUES (?,?,?,?,?,?)',
      ).run('recovery', scanType, issuesFound > 0 ? 'warning' : 'info', `${scanType} scan completed: ${issuesFound} issue(s) found`, '{}', now)

      return NextResponse.json({ id: result.lastInsertRowid, issuesFound }, { status: 201 })
    }
    case 'vacuum': {
      db.exec('VACUUM')
      db.prepare(
        'INSERT INTO healer_events (event_type, component, severity, message, metadata_json, created_at) VALUES (?,?,?,?,?,?)',
      ).run('vacuum', 'database', 'info', 'Database vacuum completed', '{}', now)
      return NextResponse.json({ ok: true, message: 'Vacuum completed' })
    }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/healer
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, updateConfigSchema)
  if ('error' in validated) return validated.error

  try {
    ensureTables()
    const db = getDatabase()
    const data = validated.data
    const now = Math.floor(Date.now() / 1000)

    // Upsert config entry for component
    db.prepare(`
      INSERT INTO healer_config (component, enabled, threshold, cooldown_seconds, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(component) DO UPDATE SET
        enabled = COALESCE(excluded.enabled, enabled),
        threshold = COALESCE(excluded.threshold, threshold),
        cooldown_seconds = COALESCE(excluded.cooldown_seconds, cooldown_seconds),
        updated_at = excluded.updated_at
    `).run(
      data.component,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : null,
      data.threshold ?? null,
      data.cooldown_seconds ?? null,
      now,
    )

    // Record config change event
    db.prepare(
      'INSERT INTO healer_events (event_type, component, severity, message, metadata_json, created_at) VALUES (?,?,?,?,?,?)',
    ).run('config_change', data.component, 'info', `Config updated for ${data.component}`, JSON.stringify(data), now)

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'Healer PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
