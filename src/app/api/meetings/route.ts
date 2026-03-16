import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { validateBody } from '@/lib/validation'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getDatabase } from '@/lib/db'
import {
  postBodySchema,
  patchBodySchema,
  createMeetingSchema,
  addActionItemSchema,
  uploadTranscriptSchema,
  patchMeetingSchema,
  patchActionItemSchema,
} from './schemas'

// ---------------------------------------------------------------------------
// Schema tables -- idempotent creation on first access
// ---------------------------------------------------------------------------

let tablesEnsured = false

function ensureTables(): void {
  if (tablesEnsured) return
  const db = getDatabase()

  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      start_at        TEXT NOT NULL,
      end_at          TEXT NOT NULL,
      location        TEXT,
      meeting_url     TEXT,
      participants_json TEXT DEFAULT '[]',
      agenda          TEXT,
      summary         TEXT,
      key_decisions_json TEXT DEFAULT '[]',
      transcript      TEXT,
      status          TEXT NOT NULL DEFAULT 'scheduled',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_action_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      assignee    TEXT,
      due_date    TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// GET /api/meetings
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  ensureTables()

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') ?? 'upcoming'

  try {
    if (tab === 'actions') return handleGetActions(searchParams)
    if (tab === 'past') return handleGetPastMeetings(searchParams)
    return handleGetUpcomingMeetings()
  } catch (error) {
    logger.error({ err: error }, 'Meetings GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

function handleGetUpcomingMeetings(): NextResponse {
  const db = getDatabase()
  const now = new Date().toISOString()
  const rows = db.prepare(`
    SELECT id, title, start_at, end_at, location, meeting_url,
           participants_json, agenda, status, created_at, updated_at
    FROM meetings
    WHERE start_at >= ? AND status != 'cancelled'
    ORDER BY start_at ASC
    LIMIT 100
  `).all(now)

  return NextResponse.json({ meetings: rows })
}

function handleGetPastMeetings(params: URLSearchParams): NextResponse {
  const db = getDatabase()
  const now = new Date().toISOString()
  const from = params.get('from') ?? '1970-01-01T00:00:00Z'
  const to = params.get('to') ?? now
  const search = params.get('search')

  let query = `
    SELECT id, title, start_at, end_at, location, meeting_url,
           participants_json, agenda, summary, key_decisions_json,
           status, created_at, updated_at
    FROM meetings
    WHERE start_at < ? AND start_at >= ? AND start_at <= ?
  `
  const queryParams: unknown[] = [now, from, to]

  if (search) {
    query += ` AND (title LIKE ? OR summary LIKE ?)`
    const pattern = `%${search}%`
    queryParams.push(pattern, pattern)
  }

  query += ` ORDER BY start_at DESC LIMIT 100`

  const rows = db.prepare(query).all(...queryParams)
  return NextResponse.json({ meetings: rows })
}

function handleGetActions(params: URLSearchParams): NextResponse {
  const db = getDatabase()
  const assignee = params.get('assignee')
  const status = params.get('status')

  let query = `
    SELECT ai.id, ai.meeting_id, ai.description, ai.assignee,
           ai.due_date, ai.status, ai.created_at, ai.updated_at,
           m.title AS meeting_title
    FROM meeting_action_items ai
    JOIN meetings m ON m.id = ai.meeting_id
    WHERE 1=1
  `
  const queryParams: unknown[] = []

  if (assignee) {
    query += ` AND ai.assignee = ?`
    queryParams.push(assignee)
  }
  if (status) {
    query += ` AND ai.status = ?`
    queryParams.push(status)
  }

  query += ` ORDER BY ai.due_date ASC NULLS LAST, ai.created_at DESC LIMIT 200`

  const rows = db.prepare(query).all(...queryParams)
  return NextResponse.json({ actions: rows })
}

// ---------------------------------------------------------------------------
// POST /api/meetings
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  ensureTables()

  const validated = await validateBody(request, postBodySchema)
  if ('error' in validated) return validated.error

  try {
    return dispatchPost(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'Meetings POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function dispatchPost(data: z.infer<typeof postBodySchema>): NextResponse {
  switch (data.action) {
    case 'create_meeting': return handleCreateMeeting(data)
    case 'add_action_item': return handleAddActionItem(data)
    case 'upload_transcript': return handleUploadTranscript(data)
  }
}

function handleCreateMeeting(data: z.infer<typeof createMeetingSchema>): NextResponse {
  const db = getDatabase()
  const result = db.prepare(`
    INSERT INTO meetings (title, start_at, end_at, location, meeting_url, participants_json, agenda)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.title, data.start_at, data.end_at,
    data.location ?? null, data.meeting_url ?? null,
    JSON.stringify(data.participants ?? []),
    data.agenda ?? null,
  )

  return NextResponse.json(
    { id: result.lastInsertRowid, message: 'Meeting created' },
    { status: 201 },
  )
}

function handleAddActionItem(data: z.infer<typeof addActionItemSchema>): NextResponse {
  const db = getDatabase()
  const result = db.prepare(`
    INSERT INTO meeting_action_items (meeting_id, description, assignee, due_date)
    VALUES (?, ?, ?, ?)
  `).run(data.meeting_id, data.description, data.assignee ?? null, data.due_date ?? null)

  return NextResponse.json(
    { id: result.lastInsertRowid, message: 'Action item added' },
    { status: 201 },
  )
}

function handleUploadTranscript(
  data: z.infer<typeof uploadTranscriptSchema>,
): NextResponse {
  const db = getDatabase()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE meetings
    SET transcript = ?, summary = ?, key_decisions_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.transcript, data.summary ?? null,
    JSON.stringify(data.key_decisions ?? []), now, data.meeting_id,
  )

  return NextResponse.json({ message: 'Transcript uploaded' })
}

// ---------------------------------------------------------------------------
// PATCH /api/meetings
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  ensureTables()

  const validated = await validateBody(request, patchBodySchema)
  if ('error' in validated) return validated.error

  try {
    return dispatchPatch(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'Meetings PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function dispatchPatch(data: z.infer<typeof patchBodySchema>): NextResponse {
  switch (data.action) {
    case 'update_meeting': return handleUpdateMeeting(data)
    case 'complete_action_item': return handleCompleteActionItem(data)
  }
}

function handleUpdateMeeting(data: z.infer<typeof patchMeetingSchema>): NextResponse {
  const db = getDatabase()
  const now = new Date().toISOString()

  const fields: string[] = ['updated_at = ?']
  const values: unknown[] = [now]

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title) }
  if (data.start_at !== undefined) { fields.push('start_at = ?'); values.push(data.start_at) }
  if (data.end_at !== undefined) { fields.push('end_at = ?'); values.push(data.end_at) }
  if (data.location !== undefined) { fields.push('location = ?'); values.push(data.location) }
  if (data.meeting_url !== undefined) { fields.push('meeting_url = ?'); values.push(data.meeting_url) }
  if (data.participants !== undefined) { fields.push('participants_json = ?'); values.push(JSON.stringify(data.participants)) }
  if (data.agenda !== undefined) { fields.push('agenda = ?'); values.push(data.agenda) }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status) }

  values.push(data.id)
  db.prepare(`UPDATE meetings SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  return NextResponse.json({ message: 'Meeting updated' })
}

function handleCompleteActionItem(
  data: z.infer<typeof patchActionItemSchema>,
): NextResponse {
  const db = getDatabase()
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE meeting_action_items SET status = ?, updated_at = ? WHERE id = ?
  `).run(data.status, now, data.id)

  return NextResponse.json({ message: 'Action item updated' })
}

// ---------------------------------------------------------------------------
// DELETE /api/meetings
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  ensureTables()

  const { searchParams } = new URL(request.url)
  const meetingId = searchParams.get('meeting_id')
  const actionId = searchParams.get('action_id')

  try {
    if (actionId) return handleDeleteActionItem(Number(actionId))
    if (meetingId) return handleDeleteMeeting(Number(meetingId))
    return NextResponse.json(
      { error: 'meeting_id or action_id query param required' },
      { status: 400 },
    )
  } catch (error) {
    logger.error({ err: error }, 'Meetings DELETE failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function handleDeleteMeeting(id: number): NextResponse {
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid meeting_id' }, { status: 400 })
  }
  const db = getDatabase()
  db.prepare('DELETE FROM meetings WHERE id = ?').run(id)
  return NextResponse.json({ message: 'Meeting deleted' })
}

function handleDeleteActionItem(id: number): NextResponse {
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid action_id' }, { status: 400 })
  }
  const db = getDatabase()
  db.prepare('DELETE FROM meeting_action_items WHERE id = ?').run(id)
  return NextResponse.json({ message: 'Action item deleted' })
}

export const dynamic = 'force-dynamic'
