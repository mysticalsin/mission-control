// ── Life Manager shared types ───────────────────────────────────────────

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type ReminderStatus = 'pending' | 'snoozed' | 'completed' | 'dismissed'
export type HabitFrequency = 'daily' | 'weekly'
export type LifeTab = 'reminders' | 'digest' | 'habits' | 'notes'

export interface Reminder {
  readonly id: number
  readonly title: string
  readonly description: string
  readonly due_at: string
  readonly priority: Priority
  readonly status: ReminderStatus
  readonly is_recurring: number
  readonly recurrence_rule: string | null
  readonly created_at: string
  readonly updated_at: string
}

export interface Habit {
  readonly id: number
  readonly name: string
  readonly frequency: HabitFrequency
  readonly current_streak: number
  readonly best_streak: number
  readonly total_completions: number
  readonly created_at: string
}

export interface HabitLogEntry {
  readonly id: number
  readonly habit_id: number
  readonly completed_at: string
  readonly notes: string | null
}

export interface Note {
  readonly id: number
  readonly title: string
  readonly content: string
  readonly tags_json: string
  readonly created_at: string
  readonly updated_at: string
}

export interface Digest {
  readonly id: number
  readonly digest_type: string
  readonly content_json: string
  readonly generated_at: string
}

export interface DigestContent {
  readonly weather?: string
  readonly calendar?: readonly string[]
  readonly priorities?: readonly string[]
  readonly news?: readonly string[]
  readonly summary?: string
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: '#6B7280',
}

export const PRIORITY_CLASSES: Record<Priority, string> = {
  urgent: 'bg-red-500/10 text-red-500',
  high: 'bg-orange-500/10 text-orange-500',
  medium: 'bg-blue-500/10 text-blue-500',
  low: 'bg-secondary text-muted-foreground',
}
