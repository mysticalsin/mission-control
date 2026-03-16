// ── Shared types for the Meetings panel ─────────────

export interface Meeting {
  readonly id: number
  readonly title: string
  readonly start_at: string
  readonly end_at: string
  readonly location: string | null
  readonly meeting_url: string | null
  readonly participants_json: string
  readonly agenda: string | null
  readonly summary: string | null
  readonly key_decisions_json: string | null
  readonly transcript: string | null
  readonly status: string
  readonly created_at: string
  readonly updated_at: string
}

export interface ActionItem {
  readonly id: number
  readonly meeting_id: number
  readonly description: string
  readonly assignee: string | null
  readonly due_date: string | null
  readonly status: 'open' | 'in-progress' | 'done'
  readonly meeting_title: string
  readonly created_at: string
  readonly updated_at: string
}

export type ActionItemStatus = 'open' | 'in-progress' | 'done'

// Parsed versions for rendering convenience
export interface ParsedMeeting extends Omit<Meeting, 'participants_json' | 'key_decisions_json'> {
  readonly participants: readonly string[]
  readonly key_decisions: readonly string[]
}

/** Safely parse a JSON array column, returning empty array on failure */
export function parseJsonArray(raw: string | null): readonly string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Parse a Meeting row into a renderable shape */
export function parseMeeting(meeting: Meeting): ParsedMeeting {
  return {
    ...meeting,
    participants: parseJsonArray(meeting.participants_json),
    key_decisions: parseJsonArray(meeting.key_decisions_json),
  }
}

/** Compute duration in minutes between two ISO timestamps */
export function durationMinutes(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(0, Math.round(ms / 60_000))
}

/** Format duration as human-readable string */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

/** Status color mapping for action items */
export const STATUS_COLORS: Record<ActionItemStatus, string> = {
  'open': '#F59E0B',
  'in-progress': '#3B82F6',
  'done': '#10B981',
}

/** Status badge classes for action items */
export function statusBadgeClass(status: ActionItemStatus): string {
  switch (status) {
    case 'open':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
    case 'in-progress':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    case 'done':
      return 'bg-green-500/10 text-green-500 border-green-500/20'
  }
}
