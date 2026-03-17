export interface CalendarEvent {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly start_time: string
  readonly end_time: string | null
  readonly all_day: number
  readonly location: string
  readonly color: string
  readonly source: string
  readonly event_type: string
  readonly calendar_name?: string
}

export interface CalendarConnection {
  readonly id: string
  readonly provider: string
  readonly name: string
  readonly status: string
  readonly last_sync: string | null
  readonly created_at: string
}

export interface SyncResult {
  readonly status: string
  readonly events_synced: number
  readonly connection_id: string
}

export type CalendarTab = 'calendar' | 'sync' | 'accounts'
