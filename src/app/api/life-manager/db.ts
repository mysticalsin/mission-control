import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'

// ── Table Initialization ────────────────────────────────────────────────

let tablesEnsured = false

export function ensureTables(): void {
  if (tablesEnsured) return
  const db = getDatabase()

  db.exec(`
    CREATE TABLE IF NOT EXISTS life_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_at TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_rule TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS life_habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      total_completions INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS life_habit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT,
      FOREIGN KEY (habit_id) REFERENCES life_habits(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS life_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS life_digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digest_type TEXT NOT NULL DEFAULT 'morning',
      content_json TEXT NOT NULL DEFAULT '{}',
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  tablesEnsured = true
  logger.info('Life Manager tables ensured')
}

// ── Reminder Queries ────────────────────────────────────────────────────

interface ReminderRow {
  id: number; title: string; description: string; due_at: string
  priority: string; status: string; is_recurring: number
  recurrence_rule: string | null; created_at: string; updated_at: string
}

export function getReminders(filter?: string): ReminderRow[] {
  const db = getDatabase()
  ensureTables()

  if (filter === 'overdue') {
    return db.prepare(
      `SELECT id, title, description, due_at, priority, status, is_recurring,
              recurrence_rule, created_at, updated_at
       FROM life_reminders
       WHERE status = 'pending' AND due_at < datetime('now')
       ORDER BY due_at ASC`,
    ).all() as ReminderRow[]
  }

  if (filter === 'today') {
    return db.prepare(
      `SELECT id, title, description, due_at, priority, status, is_recurring,
              recurrence_rule, created_at, updated_at
       FROM life_reminders
       WHERE date(due_at) = date('now')
       ORDER BY due_at ASC`,
    ).all() as ReminderRow[]
  }

  if (filter === 'upcoming') {
    return db.prepare(
      `SELECT id, title, description, due_at, priority, status, is_recurring,
              recurrence_rule, created_at, updated_at
       FROM life_reminders
       WHERE due_at > datetime('now') AND status = 'pending'
       ORDER BY due_at ASC`,
    ).all() as ReminderRow[]
  }

  return db.prepare(
    `SELECT id, title, description, due_at, priority, status, is_recurring,
            recurrence_rule, created_at, updated_at
     FROM life_reminders
     ORDER BY due_at ASC`,
  ).all() as ReminderRow[]
}

export function createReminder(data: {
  title: string; description: string; due_at: string
  priority: string; is_recurring: boolean; recurrence_rule?: string
}): ReminderRow {
  const db = getDatabase()
  ensureTables()

  const result = db.prepare(
    `INSERT INTO life_reminders (title, description, due_at, priority, is_recurring, recurrence_rule)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    data.title, data.description, data.due_at,
    data.priority, data.is_recurring ? 1 : 0, data.recurrence_rule ?? null,
  )

  return db.prepare(
    `SELECT id, title, description, due_at, priority, status, is_recurring,
            recurrence_rule, created_at, updated_at
     FROM life_reminders WHERE id = ?`,
  ).get(result.lastInsertRowid) as ReminderRow
}

export function updateReminderStatus(id: number, status: string): boolean {
  const db = getDatabase()
  ensureTables()

  const result = db.prepare(
    `UPDATE life_reminders SET status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(status, id)

  return result.changes > 0
}

export function deleteReminder(id: number): boolean {
  const db = getDatabase()
  ensureTables()
  return db.prepare('DELETE FROM life_reminders WHERE id = ?').run(id).changes > 0
}

// ── Habit Queries ───────────────────────────────────────────────────────

interface HabitRow {
  id: number; name: string; frequency: string
  current_streak: number; best_streak: number
  total_completions: number; created_at: string
}

interface HabitLogRow {
  id: number; habit_id: number; completed_at: string; notes: string | null
}

export function getHabits(): { habits: HabitRow[]; logs: Record<number, HabitLogRow[]> } {
  const db = getDatabase()
  ensureTables()

  const habits = db.prepare(
    `SELECT id, name, frequency, current_streak, best_streak,
            total_completions, created_at
     FROM life_habits ORDER BY created_at DESC`,
  ).all() as HabitRow[]

  const logs: Record<number, HabitLogRow[]> = {}
  for (const habit of habits) {
    logs[habit.id] = db.prepare(
      `SELECT id, habit_id, completed_at, notes
       FROM life_habit_log
       WHERE habit_id = ?
       ORDER BY completed_at DESC
       LIMIT 60`,
    ).all(habit.id) as HabitLogRow[]
  }

  return { habits, logs }
}

export function createHabit(name: string, frequency: string): HabitRow {
  const db = getDatabase()
  ensureTables()

  const result = db.prepare(
    'INSERT INTO life_habits (name, frequency) VALUES (?, ?)',
  ).run(name, frequency)

  return db.prepare(
    `SELECT id, name, frequency, current_streak, best_streak,
            total_completions, created_at
     FROM life_habits WHERE id = ?`,
  ).get(result.lastInsertRowid) as HabitRow
}

export function toggleHabitToday(habitId: number): boolean {
  const db = getDatabase()
  ensureTables()

  const todayStr = new Date().toISOString().split('T')[0]

  // Check if already completed today
  const existing = db.prepare(
    `SELECT id FROM life_habit_log
     WHERE habit_id = ? AND date(completed_at) = ?`,
  ).get(habitId, todayStr)

  if (existing) {
    // Un-complete: remove log and decrement
    db.prepare('DELETE FROM life_habit_log WHERE id = ?').run((existing as { id: number }).id)
    db.prepare(
      `UPDATE life_habits
       SET total_completions = MAX(0, total_completions - 1),
           current_streak = MAX(0, current_streak - 1)
       WHERE id = ?`,
    ).run(habitId)
    return false
  }

  // Complete: add log and increment
  db.prepare(
    'INSERT INTO life_habit_log (habit_id, completed_at) VALUES (?, ?)',
  ).run(habitId, new Date().toISOString())

  db.prepare(
    `UPDATE life_habits
     SET total_completions = total_completions + 1,
         current_streak = current_streak + 1,
         best_streak = MAX(best_streak, current_streak + 1)
     WHERE id = ?`,
  ).run(habitId)

  return true
}

export function deleteHabit(id: number): boolean {
  const db = getDatabase()
  ensureTables()
  return db.prepare('DELETE FROM life_habits WHERE id = ?').run(id).changes > 0
}

// ── Note Queries ────────────────────────────────────────────────────────

interface NoteRow {
  id: number; title: string; content: string
  tags_json: string; created_at: string; updated_at: string
}

export function getNotes(): NoteRow[] {
  const db = getDatabase()
  ensureTables()

  return db.prepare(
    `SELECT id, title, content, tags_json, created_at, updated_at
     FROM life_notes ORDER BY updated_at DESC`,
  ).all() as NoteRow[]
}

export function createNote(
  title: string, content: string, tags: string[],
): NoteRow {
  const db = getDatabase()
  ensureTables()

  const result = db.prepare(
    `INSERT INTO life_notes (title, content, tags_json) VALUES (?, ?, ?)`,
  ).run(title, content, JSON.stringify(tags))

  return db.prepare(
    `SELECT id, title, content, tags_json, created_at, updated_at
     FROM life_notes WHERE id = ?`,
  ).get(result.lastInsertRowid) as NoteRow
}

export function updateNote(
  id: number, title: string, content: string, tags: string[],
): boolean {
  const db = getDatabase()
  ensureTables()

  const result = db.prepare(
    `UPDATE life_notes
     SET title = ?, content = ?, tags_json = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(title, content, JSON.stringify(tags), id)

  return result.changes > 0
}

export function deleteNote(id: number): boolean {
  const db = getDatabase()
  ensureTables()
  return db.prepare('DELETE FROM life_notes WHERE id = ?').run(id).changes > 0
}

// ── Digest Queries ──────────────────────────────────────────────────────

interface DigestRow {
  id: number; digest_type: string; content_json: string; generated_at: string
}

export function getDigests(): DigestRow[] {
  const db = getDatabase()
  ensureTables()

  return db.prepare(
    `SELECT id, digest_type, content_json, generated_at
     FROM life_digests ORDER BY generated_at DESC LIMIT 10`,
  ).all() as DigestRow[]
}

export function createDigest(digestType: string, content: object): DigestRow {
  const db = getDatabase()
  ensureTables()

  const result = db.prepare(
    'INSERT INTO life_digests (digest_type, content_json) VALUES (?, ?)',
  ).run(digestType, JSON.stringify(content))

  return db.prepare(
    `SELECT id, digest_type, content_json, generated_at
     FROM life_digests WHERE id = ?`,
  ).get(result.lastInsertRowid) as DigestRow
}
