'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import {
  type TabKey, type DashboardStats, type VideoStream, type EventsResponse,
  TABS, fetchDashboard, fetchStreams, fetchEvents, triggerAnalysis, createStream,
} from './video-intel-types'

const log = createClientLogger('VideoIntelPanel')

// ---------------------------------------------------------------------------
// Shared UI blocks
// ---------------------------------------------------------------------------

function ErrorBlock({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center">
      <p className="text-sm text-red-400">{message}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>Retry</Button>
    </div>
  )
}

function EmptyBlock({ message }: { readonly message: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-8 text-center">
      <p className="text-sm text-zinc-500">{message}</p>
    </div>
  )
}

function StatCard({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-4">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-100">{value}</p>
    </div>
  )
}

function ConfidenceBadge({ value }: { readonly value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
  return <span className={`font-mono text-xs ${color}`}>{pct}%</span>
}

function StatusBadge({ status }: { readonly status: string }) {
  const color =
    status === 'active' ? 'bg-emerald-500/20 text-emerald-400'
    : status === 'error' ? 'bg-red-500/20 text-red-400'
    : 'bg-zinc-500/20 text-zinc-400'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tab: Dashboard
// ---------------------------------------------------------------------------

function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setStats(await fetchDashboard())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Dashboard fetch failed', { error: message })
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <Loader />
  if (error) return <ErrorBlock message={error} onRetry={load} />
  if (!stats) return <EmptyBlock message="No dashboard data available." />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Streams" value={stats.total_streams} />
        <StatCard label="Active" value={stats.active_streams} />
        <StatCard label="Events Today" value={stats.events_today} />
        <StatCard label="Events (1h)" value={stats.events_last_hour} />
      </div>
      {stats.top_labels.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Top Detections Today</h3>
          <div className="space-y-1">
            {stats.top_labels.map((lbl) => (
              <div key={lbl.label} className="flex items-center justify-between rounded bg-zinc-800/40 px-3 py-1.5 text-sm">
                <span className="text-zinc-200">{lbl.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-zinc-400">{lbl.count}x</span>
                  <ConfidenceBadge value={lbl.avg_confidence} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {stats.recent_alerts.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Recent High-Confidence Alerts</h3>
          <div className="space-y-1">
            {stats.recent_alerts.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between rounded bg-zinc-800/40 px-3 py-1.5 text-xs">
                <span className="text-zinc-200">{evt.label}</span>
                <span className="text-zinc-500">{evt.stream_name ?? `Stream #${evt.stream_id}`}</span>
                <ConfidenceBadge value={evt.confidence} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Streams
// ---------------------------------------------------------------------------

function StreamsTab() {
  const [streams, setStreams] = useState<readonly VideoStream[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setStreams(await fetchStreams())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Streams fetch failed', { error: message })
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleAnalyze = useCallback(async (streamId: number) => {
    try {
      setAnalyzing(streamId)
      await triggerAnalysis(streamId)
      await load()
    } catch (err) {
      log.error('Analysis trigger failed', { error: String(err) })
    } finally {
      setAnalyzing(null)
    }
  }, [load])

  if (loading) return <Loader />
  if (error) return <ErrorBlock message={error} onRetry={load} />
  if (streams.length === 0) return <EmptyBlock message="No video streams configured." />

  return (
    <div className="space-y-2">
      {streams.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-zinc-100">{s.name}</span>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {s.stream_type.toUpperCase()} | {s.resolution || 'N/A'} | {s.fps || 0} fps | {s.event_count} events
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={analyzing === s.id} onClick={() => void handleAnalyze(s.id)}>
            {analyzing === s.id ? 'Starting...' : 'Analyze'}
          </Button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Events
// ---------------------------------------------------------------------------

function EventsTab() {
  const [data, setData] = useState<EventsResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: number) => {
    try {
      setLoading(true)
      setError(null)
      setData(await fetchEvents(p))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Events fetch failed', { error: message })
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(page) }, [load, page])

  if (loading) return <Loader />
  if (error) return <ErrorBlock message={error} onRetry={() => void load(page)} />
  if (!data || data.events.length === 0) return <EmptyBlock message="No video events recorded yet." />

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {data.events.map((evt) => (
          <div key={evt.id} className="flex items-center justify-between rounded bg-zinc-800/40 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <span className="font-medium text-zinc-200">{evt.label}</span>
              <span className="ml-2 text-xs text-zinc-500">{evt.event_type}</span>
              {evt.stream_name && <span className="ml-2 text-xs text-zinc-600">on {evt.stream_name}</span>}
            </div>
            <div className="flex items-center gap-3">
              <ConfidenceBadge value={evt.confidence} />
              <span className="text-xs text-zinc-500">{new Date(evt.created_at).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
      {data.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-xs text-zinc-400">{data.page} / {data.total_pages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.total_pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Add Stream
// ---------------------------------------------------------------------------

function AddStreamTab({ onCreated }: { readonly onCreated: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [streamType, setStreamType] = useState('rtsp')
  const [analysisEnabled, setAnalysisEnabled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !url.trim()) { setError('Name and URL are required.'); return }
    try {
      setSubmitting(true)
      setError(null)
      await createStream({ name: name.trim(), url: url.trim(), stream_type: streamType, analysis_enabled: analysisEnabled })
      setName(''); setUrl(''); setStreamType('rtsp'); setAnalysisEnabled(false)
      onCreated()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Stream creation failed', { error: message })
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }, [name, url, streamType, analysisEnabled, onCreated])

  const inputClass = 'w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none'

  return (
    <div className="max-w-md space-y-4">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Stream Name</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Office Camera 1" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Stream URL</label>
        <input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="rtsp://192.168.1.100:554/stream" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Type</label>
        <select className={inputClass} value={streamType} onChange={(e) => setStreamType(e.target.value)}>
          <option value="rtsp">RTSP</option>
          <option value="http">HTTP</option>
          <option value="hls">HLS</option>
          <option value="file">File</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={analysisEnabled} onChange={(e) => setAnalysisEnabled(e.target.checked)} className="rounded border-zinc-600" />
        Enable AI analysis on creation
      </label>
      <Button onClick={() => void handleSubmit()} disabled={submitting}>
        {submitting ? 'Creating...' : 'Create Stream'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function VideoIntelPanel() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')

  const handleStreamCreated = useCallback(() => { setActiveTab('streams') }, [])

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">Video Intelligence</h2>
      </div>
      <div className="flex gap-1 rounded-lg bg-zinc-800/50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.key ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'streams' && <StreamsTab />}
        {activeTab === 'events' && <EventsTab />}
        {activeTab === 'add' && <AddStreamTab onCreated={handleStreamCreated} />}
      </div>
    </div>
  )
}
