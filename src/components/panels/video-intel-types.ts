// ---------------------------------------------------------------------------
// Video Intelligence — shared types and data fetchers
// Extracted to keep the panel component under 400 lines
// ---------------------------------------------------------------------------

export interface VideoStream {
  readonly id: number
  readonly name: string
  readonly url: string
  readonly stream_type: string
  readonly status: string
  readonly resolution: string
  readonly fps: number
  readonly analysis_enabled: number
  readonly event_count: number
  readonly created_at: string
  readonly updated_at: string
}

export interface VideoEvent {
  readonly id: number
  readonly stream_id: number
  readonly stream_name: string | null
  readonly event_type: string
  readonly label: string
  readonly confidence: number
  readonly bbox_json: string
  readonly frame_url: string
  readonly metadata_json: string
  readonly created_at: string
}

export interface DashboardStats {
  readonly total_streams: number
  readonly active_streams: number
  readonly analysis_enabled: number
  readonly events_today: number
  readonly events_last_hour: number
  readonly event_type_breakdown: readonly { event_type: string; count: number }[]
  readonly top_labels: readonly { label: string; count: number; avg_confidence: number }[]
  readonly recent_alerts: readonly VideoEvent[]
}

export interface EventsResponse {
  readonly events: readonly VideoEvent[]
  readonly total: number
  readonly page: number
  readonly per_page: number
  readonly total_pages: number
}

export type TabKey = 'dashboard' | 'streams' | 'events' | 'add'

export const TABS: readonly { readonly key: TabKey; readonly label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'streams', label: 'Streams' },
  { key: 'events', label: 'Events' },
  { key: 'add', label: 'Add Stream' },
] as const

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

export async function fetchDashboard(): Promise<DashboardStats> {
  const res = await fetch('/api/video-intel/dashboard')
  if (!res.ok) throw new Error('Failed to fetch video dashboard')
  return (await res.json()) as DashboardStats
}

export async function fetchStreams(): Promise<VideoStream[]> {
  const res = await fetch('/api/video-intel/streams')
  if (!res.ok) throw new Error('Failed to fetch video streams')
  return (await res.json()) as VideoStream[]
}

export async function fetchEvents(page = 1): Promise<EventsResponse> {
  const res = await fetch(`/api/video-intel/events?page=${page}&per_page=25`)
  if (!res.ok) throw new Error('Failed to fetch video events')
  return (await res.json()) as EventsResponse
}

export async function triggerAnalysis(streamId: number): Promise<void> {
  const res = await fetch('/api/video-intel/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stream_id: streamId }),
  })
  if (!res.ok) throw new Error('Failed to trigger analysis')
}

export async function createStream(payload: {
  name: string
  url: string
  stream_type: string
  analysis_enabled: boolean
}): Promise<VideoStream> {
  const res = await fetch('/api/video-intel/streams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create stream')
  return (await res.json()) as VideoStream
}
