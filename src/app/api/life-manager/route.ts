import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { validateBody } from '@/lib/validation'
import { readLimiter, mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import {
  getReminders, createReminder, updateReminderStatus, deleteReminder,
  getHabits, createHabit, toggleHabitToday, deleteHabit,
  getNotes, createNote, updateNote, deleteNote,
  getDigests, createDigest,
  getHealthMetrics, createHealthMetric, deleteHealthMetric,
} from './db'

// ── Zod Schemas ─────────────────────────────────────────────────────────

const createReminderSchema = z.object({
  action: z.literal('create_reminder'),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  due_at: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  is_recurring: z.boolean().default(false),
  recurrence_rule: z.string().max(200).optional(),
})

const createHabitSchema = z.object({
  action: z.literal('create_habit'),
  name: z.string().min(1).max(200),
  frequency: z.enum(['daily', 'weekly']).default('daily'),
})

const createNoteSchema = z.object({
  action: z.literal('create_note'),
  title: z.string().min(1).max(200),
  content: z.string().max(10000).default(''),
  tags: z.array(z.string().max(50)).max(20).default([]),
})

const generateDigestSchema = z.object({
  action: z.literal('generate_digest'),
  digest_type: z.enum(['morning', 'evening']).default('morning'),
})

const createHealthMetricSchema = z.object({
  action: z.literal('create_health_metric'),
  metric_type: z.enum([
    'weight', 'blood_pressure_systolic', 'blood_pressure_diastolic',
    'heart_rate', 'steps', 'sleep_hours', 'calories', 'mood',
  ]),
  value: z.number(),
  unit: z.string().max(20).default(''),
  notes: z.string().max(2000).optional(),
  recorded_at: z.string().max(30).optional(),
})

const postSchema = z.discriminatedUnion('action', [
  createReminderSchema,
  createHabitSchema,
  createNoteSchema,
  generateDigestSchema,
  createHealthMetricSchema,
])

const patchSchema = z.object({
  entity: z.enum(['reminder', 'habit', 'note']),
  id: z.number().int().positive(),
  status: z.enum(['pending', 'snoozed', 'completed', 'dismissed']).optional(),
  toggle_today: z.boolean().optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(10000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
})

const deleteSchema = z.object({
  entity: z.enum(['reminder', 'habit', 'note', 'health_metric']),
  id: z.number().int().positive(),
})

// ── GET /api/life-manager ───────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimited = readLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') ?? 'reminders'

  try {
    return handleGetTab(tab, searchParams)
  } catch (error) {
    logger.error({ err: error }, 'Life Manager GET failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function handleGetTab(tab: string, params: URLSearchParams): NextResponse {
  switch (tab) {
    case 'reminders': {
      const filter = params.get('filter') ?? undefined
      return NextResponse.json({ reminders: getReminders(filter) })
    }
    case 'digest':
      return NextResponse.json({ digests: getDigests() })
    case 'habits': {
      const { habits, logs } = getHabits()
      return NextResponse.json({ habits, logs })
    }
    case 'notes':
      return NextResponse.json({ notes: getNotes() })
    case 'health': {
      const metricType = params.get('metric_type') ?? undefined
      return NextResponse.json({ metrics: getHealthMetrics(metricType) })
    }
    default:
      return NextResponse.json({ error: 'Invalid tab parameter' }, { status: 400 })
  }
}

// ── POST /api/life-manager ──────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, postSchema)
  if ('error' in validated) return validated.error

  try {
    return dispatchPost(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'Life Manager POST failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function dispatchPost(data: z.infer<typeof postSchema>): NextResponse {
  switch (data.action) {
    case 'create_reminder': {
      const reminder = createReminder({
        title: data.title,
        description: data.description,
        due_at: data.due_at,
        priority: data.priority,
        is_recurring: data.is_recurring,
        recurrence_rule: data.recurrence_rule,
      })
      return NextResponse.json({ reminder }, { status: 201 })
    }
    case 'create_habit': {
      const habit = createHabit(data.name, data.frequency)
      return NextResponse.json({ habit }, { status: 201 })
    }
    case 'create_note': {
      const note = createNote(data.title, data.content, data.tags)
      return NextResponse.json({ note }, { status: 201 })
    }
    case 'generate_digest': {
      // Generate a placeholder digest with current date context
      const digest = createDigest(data.digest_type, buildDigestContent(data.digest_type))
      return NextResponse.json({ digest }, { status: 201 })
    }
    case 'create_health_metric': {
      const metric = createHealthMetric({
        metric_type: data.metric_type,
        value: data.value,
        unit: data.unit,
        notes: data.notes,
        recorded_at: data.recorded_at,
      })
      return NextResponse.json({ metric }, { status: 201 })
    }
  }
}

// ── PATCH /api/life-manager ─────────────────────────────────────────────

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, patchSchema)
  if ('error' in validated) return validated.error

  try {
    return dispatchPatch(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'Life Manager PATCH failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function dispatchPatch(data: z.infer<typeof patchSchema>): NextResponse {
  switch (data.entity) {
    case 'reminder': {
      if (!data.status) {
        return NextResponse.json({ error: 'status is required for reminders' }, { status: 400 })
      }
      const updated = updateReminderStatus(data.id, data.status)
      if (!updated) {
        return NextResponse.json({ error: 'Reminder not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }
    case 'habit': {
      if (data.toggle_today) {
        const completed = toggleHabitToday(data.id)
        return NextResponse.json({ success: true, completed })
      }
      return NextResponse.json({ error: 'toggle_today is required for habits' }, { status: 400 })
    }
    case 'note': {
      if (!data.title) {
        return NextResponse.json({ error: 'title is required for note update' }, { status: 400 })
      }
      const updated = updateNote(data.id, data.title, data.content ?? '', data.tags ?? [])
      if (!updated) {
        return NextResponse.json({ error: 'Note not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }
  }
}

// ── DELETE /api/life-manager ────────────────────────────────────────────

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const rateLimited = mutationLimiter(request)
  if (rateLimited) return rateLimited

  const auth = requireRole(request, 'operator')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const validated = await validateBody(request, deleteSchema)
  if ('error' in validated) return validated.error

  try {
    return dispatchDelete(validated.data)
  } catch (error) {
    logger.error({ err: error }, 'Life Manager DELETE failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function dispatchDelete(data: z.infer<typeof deleteSchema>): NextResponse {
  const deleteMap: Record<string, (id: number) => boolean> = {
    reminder: deleteReminder,
    habit: deleteHabit,
    note: deleteNote,
    health_metric: deleteHealthMetric,
  }
  const deleteFn = deleteMap[data.entity]

  const deleted = deleteFn(data.id)
  if (!deleted) {
    return NextResponse.json(
      { error: `${data.entity} not found` },
      { status: 404 },
    )
  }
  return NextResponse.json({ success: true })
}

// ── Digest Builder ──────────────────────────────────────────────────────

function buildDigestContent(digestType: string): object {
  const now = new Date()
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  // Gather pending reminders due today for the priorities section
  const todayReminders = getReminders('today')
  const priorities = todayReminders
    .slice(0, 5)
    .map(r => `[${r.priority.toUpperCase()}] ${r.title}`)

  if (digestType === 'morning') {
    return {
      summary: `Good morning! Here is your brief for ${dateStr}.`,
      weather: 'Weather data not connected. Configure an integration to see forecasts.',
      calendar: ['No calendar integration configured.'],
      priorities: priorities.length > 0 ? priorities : ['No reminders due today.'],
      news: ['News feed not connected. Configure an integration for headlines.'],
    }
  }

  return {
    summary: `Evening digest for ${dateStr}.`,
    priorities: priorities.length > 0 ? priorities : ['All clear for today.'],
    calendar: ['Review tomorrow\'s schedule in calendar integration.'],
  }
}

export const dynamic = 'force-dynamic'
