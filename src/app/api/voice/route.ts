import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { validateBody } from '@/lib/validation'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Lazy table creation — idempotent, runs once per process
// ---------------------------------------------------------------------------

let tablesEnsured = false

function ensureTables(): void {
  if (tablesEnsured) return
  const db = getDatabase()

  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transcript TEXT NOT NULL,
      response TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS voice_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  tablesEnsured = true
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const logVoiceSchema = z.object({
  action: z.literal('log_voice'),
  transcript: z.string().min(1).max(5000),
  response: z.string().max(10000).optional().default(''),
  duration_ms: z.number().int().min(0).optional().default(0),
})

const updateSettingSchema = z.object({
  action: z.literal('update_setting'),
  key: z.enum(['tts_provider', 'tts_voice', 'tts_speed', 'tts_pitch', 'stt_provider', 'stt_language']),
  value: z.string().min(1).max(500),
})

const postBodySchema = z.discriminatedUnion('action', [logVoiceSchema, updateSettingSchema])

const patchSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(500),
})

// ---------------------------------------------------------------------------
// Row types (readonly — no mutation)
// ---------------------------------------------------------------------------

interface VoiceLogRow {
  readonly id: number
  readonly transcript: string
  readonly response: string
  readonly duration_ms: number
  readonly created_at: number
}

interface VoiceSettingRow {
  readonly key: string
  readonly value: string
  readonly updated_at: number
}

// ---------------------------------------------------------------------------
// GET /api/voice?tab=history|settings
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') ?? 'history'

  try {
    ensureTables()
    const db = getDatabase()

    if (tab === 'history') {
      const rows = db.prepare(
        'SELECT id, transcript, response, duration_ms, created_at FROM voice_log ORDER BY id DESC LIMIT 100',
      ).all() as VoiceLogRow[]
      return NextResponse.json({ history: rows })
    }

    if (tab === 'settings') {
      const rows = db.prepare(
        'SELECT key, value, updated_at FROM voice_settings ORDER BY key ASC',
      ).all() as VoiceSettingRow[]
      return NextResponse.json({ settings: rows })
    }

    // Static provider catalog — no DB call needed
    if (tab === 'providers') {
      const providers = [
        { id: 'browser', name: 'Browser TTS', description: 'Built-in browser speech synthesis', requiresKey: false },
        { id: 'elevenlabs', name: 'ElevenLabs', description: 'High-quality AI voice synthesis', requiresKey: true },
        { id: 'edge-tts', name: 'Edge TTS', description: 'Microsoft Edge text-to-speech', requiresKey: false },
      ] as const
      return NextResponse.json({ providers })
    }

    return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Voice GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/voice — log_voice action
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
    const db = getDatabase()
    const body = validated.data

    if (body.action === 'log_voice') {
      const result = db.prepare(
        'INSERT INTO voice_log (transcript, response, duration_ms) VALUES (?, ?, ?)',
      ).run(body.transcript, body.response, body.duration_ms)

      const row = db.prepare(
        'SELECT id, transcript, response, duration_ms, created_at FROM voice_log WHERE id = ?',
      ).get(result.lastInsertRowid) as VoiceLogRow

      return NextResponse.json({ entry: row }, { status: 201 })
    }

    if (body.action === 'update_setting') {
      return upsertSetting(db, body.key, body.value)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    logger.error({ err: error }, 'Voice POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Shared upsert — used by both POST update_setting and PATCH
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function upsertSetting(db: any, key: string, value: string): NextResponse {
  db.prepare(
    `INSERT INTO voice_settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value)

  const row = db.prepare(
    'SELECT key, value, updated_at FROM voice_settings WHERE key = ?',
  ).get(key) as VoiceSettingRow

  return NextResponse.json({ setting: row })
}

// ---------------------------------------------------------------------------
// PATCH /api/voice — update a single voice setting
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, patchSettingSchema)
  if ('error' in validated) return validated.error

  try {
    ensureTables()
    const db = getDatabase()
    return upsertSetting(db, validated.data.key, validated.data.value)
  } catch (error) {
    logger.error({ err: error }, 'Voice PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
