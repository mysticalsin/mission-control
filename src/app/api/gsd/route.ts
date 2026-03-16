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
    CREATE TABLE IF NOT EXISTS gsd_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','on_hold','completed','archived')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
      progress INTEGER DEFAULT 0,
      due_date TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS gsd_phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES gsd_projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS gsd_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES gsd_projects(id) ON DELETE CASCADE,
      phase_id INTEGER REFERENCES gsd_phases(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','review','done','blocked')),
      assignee TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium',
      due_date TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createProjectSchema = z.object({
  action: z.literal('create_project'),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  due_date: z.string().max(30).optional(),
})

const createPhaseSchema = z.object({
  action: z.literal('create_phase'),
  project_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  order_index: z.number().int().min(0).optional(),
})

const createTaskSchema = z.object({
  action: z.literal('create_task'),
  project_id: z.number().int().positive(),
  phase_id: z.number().int().positive().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  assignee: z.string().max(100).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  due_date: z.string().max(30).optional(),
})

const postBodySchema = z.discriminatedUnion('action', [
  createProjectSchema,
  createPhaseSchema,
  createTaskSchema,
])

const patchProjectSchema = z.object({
  target: z.literal('project'),
  id: z.number().int().positive(),
  status: z.enum(['active', 'on_hold', 'completed', 'archived']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
})

const patchTaskSchema = z.object({
  target: z.literal('task'),
  id: z.number().int().positive(),
  status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']).optional(),
  assignee: z.string().max(100).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
})

const patchBodySchema = z.discriminatedUnion('target', [
  patchProjectSchema,
  patchTaskSchema,
])

const deleteBodySchema = z.object({
  entity: z.enum(['project', 'phase', 'task']),
  id: z.number().int().positive(),
})

// ---------------------------------------------------------------------------
// GET /api/gsd?tab=projects|phases|tasks&project_id=&phase_id=
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'projects'

  try {
    ensureTables()
    const db = getDatabase()

    if (tab === 'projects') return handleGetProjects(db)
    if (tab === 'phases') return handleGetPhases(db, searchParams)
    if (tab === 'tasks') return handleGetTasks(db, searchParams)

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'GSD GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetProjects(db: ReturnType<typeof getDatabase>): NextResponse {
  const projects = db.prepare(`
    SELECT p.id, p.name, p.description, p.status, p.priority, p.progress, p.due_date, p.created_at, p.updated_at,
           COUNT(DISTINCT t.id) as task_count,
           SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_count,
           COUNT(DISTINCT ph.id) as phase_count
    FROM gsd_projects p
    LEFT JOIN gsd_tasks t ON t.project_id = p.id
    LEFT JOIN gsd_phases ph ON ph.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
    LIMIT 100
  `).all()
  return NextResponse.json({ projects })
}

function handleGetPhases(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const projectId = params.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
  const phases = db.prepare(
    'SELECT id, project_id, name, order_index, status, created_at FROM gsd_phases WHERE project_id = ? ORDER BY order_index ASC',
  ).all(Number(projectId))
  return NextResponse.json({ phases })
}

function handleGetTasks(
  db: ReturnType<typeof getDatabase>,
  params: URLSearchParams,
): NextResponse {
  const projectId = params.get('project_id')
  const phaseId = params.get('phase_id')
  const statusFilter = params.get('status')

  let query = 'SELECT id, project_id, phase_id, title, description, status, assignee, priority, due_date, created_at, updated_at FROM gsd_tasks WHERE 1=1'
  const queryParams: unknown[] = []

  if (projectId) { query += ' AND project_id = ?'; queryParams.push(Number(projectId)) }
  if (phaseId) { query += ' AND phase_id = ?'; queryParams.push(Number(phaseId)) }
  if (statusFilter) { query += ' AND status = ?'; queryParams.push(statusFilter) }

  query += ' ORDER BY created_at DESC LIMIT 500'
  const tasks = db.prepare(query).all(...queryParams)
  return NextResponse.json({ tasks })
}

// ---------------------------------------------------------------------------
// POST /api/gsd
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
    return dispatchPost(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'GSD POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PostAction = z.infer<typeof postBodySchema>

function dispatchPost(data: PostAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.action) {
    case 'create_project': {
      const result = db.prepare(
        'INSERT INTO gsd_projects (name, description, priority, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(data.name, data.description ?? '', data.priority ?? 'medium', data.due_date ?? null, now, now)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'create_phase': {
      const result = db.prepare(
        'INSERT INTO gsd_phases (project_id, name, order_index, created_at) VALUES (?, ?, ?, ?)',
      ).run(data.project_id, data.name, data.order_index ?? 0, now)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
    case 'create_task': {
      const result = db.prepare(
        'INSERT INTO gsd_tasks (project_id, phase_id, title, description, assignee, priority, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(data.project_id, data.phase_id ?? null, data.title, data.description ?? '', data.assignee ?? '', data.priority ?? 'medium', data.due_date ?? null, now, now)
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
    }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/gsd
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
    return dispatchPatch(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'GSD PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type PatchAction = z.infer<typeof patchBodySchema>

function dispatchPatch(data: PatchAction): NextResponse {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)

  switch (data.target) {
    case 'project': {
      const sets: string[] = ['updated_at = ?']
      const params: unknown[] = [now]
      if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status) }
      if (data.progress !== undefined) { sets.push('progress = ?'); params.push(data.progress) }
      if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name) }
      params.push(data.id)
      db.prepare(`UPDATE gsd_projects SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return NextResponse.json({ ok: true })
    }
    case 'task': {
      const sets: string[] = ['updated_at = ?']
      const params: unknown[] = [now]
      if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status) }
      if (data.assignee !== undefined) { sets.push('assignee = ?'); params.push(data.assignee) }
      if (data.priority !== undefined) { sets.push('priority = ?'); params.push(data.priority) }
      params.push(data.id)
      db.prepare(`UPDATE gsd_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return NextResponse.json({ ok: true })
    }
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/gsd
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
    const { entity, id } = validated.data
    const tableMap = { project: 'gsd_projects', phase: 'gsd_phases', task: 'gsd_tasks' } as const
    db.prepare(`DELETE FROM ${tableMap[entity]} WHERE id = ?`).run(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error({ err: error }, 'GSD DELETE failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
