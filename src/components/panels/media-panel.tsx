'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('MediaPanel')

// ---------------------------------------------------------------------------
// Types (readonly -- immutable data flow)
// ---------------------------------------------------------------------------

interface MediaFile {
  readonly id: string
  readonly topic: string
  readonly style: string
  readonly duration: number
  readonly status: string
  readonly progress: number
  readonly output_path: string | null
  readonly thumbnail_path: string | null
  readonly error: string | null
  readonly created_at: string
  readonly completed_at: string | null
}

interface VideoStyle {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly icon: string
  readonly recommended_duration: number
}

interface FileMetadata {
  readonly id: string
  readonly topic: string
  readonly style: string
  readonly duration: number
  readonly status: string
  readonly progress: number
  readonly voice_narration: number
  readonly accent_color: string
  readonly created_at: string
  readonly started_at: string | null
  readonly completed_at: string | null
  readonly error: string | null
  readonly metadata_json: string
}

type TabKey = 'library' | 'upload' | 'processing'

interface VideoPayload {
  readonly topic: string
  readonly style: string
  readonly duration: number
  readonly voice_narration: boolean
  readonly accent_color: string
}

const TABS: readonly { readonly key: TabKey; readonly label: string }[] = [
  { key: 'library', label: 'Library' },
  { key: 'upload', label: 'Upload' },
  { key: 'processing', label: 'Processing' },
] as const

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-500/20 text-emerald-400',
  rendering: 'bg-blue-500/20 text-blue-400',
  queued: 'bg-amber-500/20 text-amber-400',
  failed: 'bg-red-500/20 text-red-400',
} as const

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchMediaFiles(): Promise<MediaFile[]> {
  const res = await fetch('/api/media')
  if (!res.ok) throw new Error('Failed to fetch media library')
  return ((await res.json()) as { videos: MediaFile[] }).videos
}

async function fetchVideoStyles(): Promise<VideoStyle[]> {
  const res = await fetch('/api/media/styles')
  if (!res.ok) throw new Error('Failed to fetch video styles')
  return ((await res.json()) as { styles: VideoStyle[] }).styles
}

async function fetchFileDetail(jobId: string): Promise<FileMetadata> {
  const res = await fetch(`/api/media/detail?jobId=${encodeURIComponent(jobId)}`)
  if (!res.ok) throw new Error('Failed to fetch file metadata')
  return (await res.json()) as FileMetadata
}

async function createVideoJob(payload: VideoPayload): Promise<MediaFile> {
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create video job')
  return (await res.json()) as MediaFile
}

async function deleteMediaFile(jobId: string): Promise<void> {
  const res = await fetch(`/api/media/delete?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete media file')
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

// ---------------------------------------------------------------------------
// Tiny sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { readonly status: string }): React.ReactElement {
  const color = STATUS_COLORS[status] ?? 'bg-zinc-500/20 text-zinc-400'
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>
}

function Row({ label, value }: { readonly label: string; readonly value: string }): React.ReactElement {
  return (
    <div className="flex justify-between border-b border-zinc-800 pb-1">
      <span className="text-zinc-500">{label}</span>
      <span className="max-w-[60%] truncate text-right">{value}</span>
    </div>
  )
}

function MetadataDrawer({ file, onClose }: { readonly file: FileMetadata | null; readonly onClose: () => void }): React.ReactElement | null {
  if (!file) return null
  const rows: [string, string][] = [
    ['ID', file.id], ['Topic', file.topic], ['Style', file.style],
    ['Duration', `${file.duration}s`], ['Status', file.status], ['Progress', `${file.progress}%`],
    ['Narration', file.voice_narration ? 'Yes' : 'No'], ['Color', file.accent_color],
    ['Created', file.created_at],
    ...(file.started_at ? [['Started', file.started_at] as [string, string]] : []),
    ...(file.completed_at ? [['Completed', file.completed_at] as [string, string]] : []),
    ...(file.error ? [['Error', file.error] as [string, string]] : []),
  ]
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-zinc-900/95 p-4 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">File Metadata</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <div className="space-y-2 overflow-y-auto text-xs text-zinc-300">
        {rows.map(([l, v]) => <Row key={l} label={l} value={v} />)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Library Tab
// ---------------------------------------------------------------------------

function LibraryTab({ files, loading, error, onRefresh, onViewMeta, onDelete }: {
  readonly files: readonly MediaFile[]; readonly loading: boolean; readonly error: string | null
  readonly onRefresh: () => void; readonly onViewMeta: (id: string) => void; readonly onDelete: (id: string) => void
}): React.ReactElement {
  if (loading) return <Loader variant="inline" label="Loading media..." />
  if (error) return (
    <div className="mt-8 text-center text-sm text-red-400">
      {error}
      <Button variant="ghost" size="sm" className="ml-2" onClick={onRefresh}>Retry</Button>
    </div>
  )
  if (files.length === 0) return <div className="mt-12 text-center text-sm text-zinc-500">No media files yet. Create a video from the Upload tab.</div>

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <div key={file.id} className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="mb-2 flex h-24 items-center justify-center rounded bg-zinc-800 text-xs text-zinc-500">
            {file.style === 'data-viz' ? 'Chart' : 'Video'}
          </div>
          <p className="truncate text-sm font-medium text-zinc-200">{file.topic}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
            <StatusBadge status={file.status} />
            <span>{file.duration}s</span>
            <span className="capitalize">{file.style}</span>
          </div>
          <div className="mt-2 flex gap-1">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onViewMeta(file.id)}>Details</Button>
            <Button variant="ghost" size="sm" className="text-xs text-red-400" onClick={() => onDelete(file.id)}>Delete</Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upload Tab
// ---------------------------------------------------------------------------

function UploadTab({ styles, onSubmit, submitting }: {
  readonly styles: readonly VideoStyle[]; readonly onSubmit: (p: VideoPayload) => void; readonly submitting: boolean
}): React.ReactElement {
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState('explainer')
  const [duration, setDuration] = useState(30)
  const [narration, setNarration] = useState(false)
  const [color, setColor] = useState('#4A0E8E')

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!topic.trim()) return
    onSubmit({ topic: topic.trim(), style, duration, voice_narration: narration, accent_color: color })
    setTopic('')
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Topic</label>
        <input type="text" className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
          placeholder="What should the video be about?" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} required />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Style</label>
        <select className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-purple-500 focus:outline-none"
          value={style} onChange={(e) => setStyle(e.target.value)}>
          {styles.map((s) => <option key={s.id} value={s.id}>{s.name} -- {s.description}</option>)}
        </select>
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-400">Duration ({duration}s)</label>
          <input type="range" min={15} max={120} step={5} value={duration}
            onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-purple-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Color</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-zinc-700 bg-zinc-800" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={narration} onChange={(e) => setNarration(e.target.checked)} className="accent-purple-500" />
        AI voice narration
      </label>
      <Button type="submit" className="w-full" disabled={submitting || !topic.trim()}>
        {submitting ? 'Creating...' : 'Generate Video'}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Processing Tab
// ---------------------------------------------------------------------------

function ProcessingTab({ files, loading }: { readonly files: readonly MediaFile[]; readonly loading: boolean }): React.ReactElement {
  const active = files.filter((f) => f.status === 'queued' || f.status === 'rendering')
  if (loading) return <Loader variant="inline" label="Loading jobs..." />
  if (active.length === 0) return <div className="mt-12 text-center text-sm text-zinc-500">No jobs currently processing.</div>

  return (
    <div className="space-y-3">
      {active.map((job) => (
        <div key={job.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-center justify-between">
            <p className="truncate text-sm font-medium text-zinc-200">{job.topic}</p>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">{job.style} -- {job.duration}s</p>
          {job.status === 'rendering' && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${job.progress}%` }} />
            </div>
          )}
          {job.status === 'queued' && <p className="mt-2 text-xs italic text-zinc-600">Waiting in queue...</p>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function MediaPanel(): React.ReactElement {
  const [tab, setTab] = useState<TabKey>('library')
  const [files, setFiles] = useState<readonly MediaFile[]>([])
  const [styles, setStyles] = useState<readonly VideoStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedMeta, setSelectedMeta] = useState<FileMetadata | null>(null)

  const loadFiles = useCallback(async (): Promise<void> => {
    try { setLoading(true); setError(null); setFiles(await fetchMediaFiles()) }
    catch (err) { const m = errMsg(err); log.error('Failed to load media files', m); setError(m) }
    finally { setLoading(false) }
  }, [])

  const loadStyles = useCallback(async (): Promise<void> => {
    try { setStyles(await fetchVideoStyles()) }
    catch (err) { log.error('Failed to load video styles', errMsg(err)) }
  }, [])

  useEffect(() => { void loadFiles(); void loadStyles() }, [loadFiles, loadStyles])

  // Auto-refresh processing tab every 5s
  useEffect(() => {
    if (tab !== 'processing') return
    const id = setInterval(() => void loadFiles(), 5000)
    return () => clearInterval(id)
  }, [tab, loadFiles])

  const handleCreate = useCallback(async (payload: VideoPayload): Promise<void> => {
    try { setSubmitting(true); await createVideoJob(payload); setTab('processing'); await loadFiles() }
    catch (err) { log.error('Failed to create video', errMsg(err)) }
    finally { setSubmitting(false) }
  }, [loadFiles])

  const handleViewMeta = useCallback(async (id: string): Promise<void> => {
    try { setSelectedMeta(await fetchFileDetail(id)) }
    catch (err) { log.error('Failed to fetch metadata', errMsg(err)) }
  }, [])

  const handleDelete = useCallback(async (id: string): Promise<void> => {
    try { await deleteMediaFile(id); await loadFiles() }
    catch (err) { log.error('Failed to delete file', errMsg(err)) }
  }, [loadFiles])

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <MetadataDrawer file={selectedMeta} onClose={() => setSelectedMeta(null)} />
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-100">Media Hub</h2>
        <Button variant="ghost" size="sm" onClick={() => void loadFiles()}>Refresh</Button>
      </div>
      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-900 p-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'library' && <LibraryTab files={files} loading={loading} error={error}
          onRefresh={() => void loadFiles()} onViewMeta={(id) => void handleViewMeta(id)} onDelete={(id) => void handleDelete(id)} />}
        {tab === 'upload' && <UploadTab styles={styles} onSubmit={(p) => void handleCreate(p)} submitting={submitting} />}
        {tab === 'processing' && <ProcessingTab files={files} loading={loading} />}
      </div>
    </div>
  )
}
