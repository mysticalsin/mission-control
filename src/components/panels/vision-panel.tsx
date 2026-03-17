'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('VisionPanel')

// ---------------------------------------------------------------------------
// Types (readonly -- immutable data flow)
// ---------------------------------------------------------------------------

interface TranscriptionJob {
  readonly id: string
  readonly filename: string
  readonly file_size: number
  readonly status: 'pending' | 'processing' | 'completed' | 'failed'
  readonly language: string | null
  readonly duration_seconds: number | null
  readonly word_count: number | null
  readonly error: string | null
  readonly created_at: string
}

interface TranscriptionDetail {
  readonly id: string
  readonly filename: string
  readonly status: string
  readonly text: string | null
  readonly segments: ReadonlyArray<{ readonly start: number; readonly end: number; readonly text: string }>
  readonly language: string | null
  readonly duration_seconds: number | null
  readonly word_count: number | null
  readonly model: string | null
}

interface JobListResponse {
  readonly items: ReadonlyArray<TranscriptionJob>
  readonly total: number
}

type TabId = 'jobs' | 'new' | 'analysis'

const TABS: ReadonlyArray<{ readonly id: TabId; readonly label: string }> = [
  { id: 'jobs', label: 'Transcription Jobs' },
  { id: 'new', label: 'New Transcription' },
  { id: 'analysis', label: 'Vision Analysis' },
]

const ALLOWED_EXT = '.mp4,.mp3,.wav,.webm,.m4a,.ogg,.flac,.aac,.mkv,.avi,.mov,.opus'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { readonly status: string }): React.JSX.Element {
  const cls: Record<string, string> = {
    completed: 'bg-emerald-600/20 text-emerald-400',
    processing: 'bg-blue-600/20 text-blue-400',
    pending: 'bg-yellow-600/20 text-yellow-400',
    failed: 'bg-red-600/20 text-red-400',
  }
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls[status] ?? 'bg-zinc-600/20 text-zinc-400'}`}>
      {status}
    </span>
  )
}

function fmtDur(s: number | null): string {
  if (s === null) return '--'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  return b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchJobs(): Promise<JobListResponse> {
  const r = await fetch('/api/vision')
  if (!r.ok) throw new Error('Failed to fetch transcription jobs')
  return r.json() as Promise<JobListResponse>
}

async function fetchDetail(id: string): Promise<TranscriptionDetail> {
  const r = await fetch(`/api/vision/jobs?id=${encodeURIComponent(id)}`)
  if (!r.ok) throw new Error('Failed to fetch job detail')
  return r.json() as Promise<TranscriptionDetail>
}

async function uploadFile(file: File, lang: string): Promise<{ job_id: string }> {
  const fd = new FormData()
  fd.append('file', file)
  if (lang) fd.append('language', lang)
  fd.append('task', 'transcribe')
  const r = await fetch('/api/vision', { method: 'POST', body: fd })
  if (!r.ok) {
    const b = await r.json().catch(() => ({}))
    throw new Error((b as { error?: string }).error ?? 'Upload failed')
  }
  return r.json() as Promise<{ job_id: string }>
}

async function analyzeImg(file: File, prompt: string): Promise<{ description: string }> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('prompt', prompt || 'Describe this image in detail.')
  const r = await fetch('/api/vision/analyze', { method: 'POST', body: fd })
  if (!r.ok) {
    const b = await r.json().catch(() => ({}))
    throw new Error((b as { error?: string }).error ?? 'Analysis failed')
  }
  return r.json() as Promise<{ description: string }>
}

// ---------------------------------------------------------------------------
// Tab: Transcription Jobs
// ---------------------------------------------------------------------------

function JobsTab(): React.JSX.Element {
  const [jobs, setJobs] = useState<ReadonlyArray<TranscriptionJob>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<TranscriptionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    try { setLoading(true); setError(null); setJobs((await fetchJobs()).items) }
    catch (e) { const m = e instanceof Error ? e.message : 'Unknown'; log.error(m); setError(m) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const select = useCallback(async (id: string) => {
    try { setDetailLoading(true); setDetail(await fetchDetail(id)) }
    catch { log.error('Failed to load detail'); setDetail(null) }
    finally { setDetailLoading(false) }
  }, [])

  if (loading) return <Loader />
  if (error) return (
    <div className="rounded bg-red-900/20 p-4 text-red-400">
      <p className="font-medium">Error loading jobs</p>
      <p className="mt-1 text-sm">{error}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
    </div>
  )
  if (jobs.length === 0) return (
    <div className="py-12 text-center text-zinc-500">
      <p className="text-lg">No transcription jobs yet</p>
      <p className="mt-1 text-sm">Upload a video or audio file to get started.</p>
    </div>
  )

  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-2">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-zinc-400">{jobs.length} job(s)</span>
          <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        </div>
        {jobs.map((j) => (
          <button key={j.id} onClick={() => select(j.id)}
            className={`w-full rounded border p-3 text-left transition hover:border-zinc-500 ${
              detail?.id === j.id ? 'border-blue-500 bg-blue-900/10' : 'border-zinc-700 bg-zinc-800/50'
            }`}>
            <div className="flex items-center justify-between">
              <span className="truncate text-sm font-medium text-zinc-200">{j.filename}</span>
              <StatusBadge status={j.status} />
            </div>
            <div className="mt-1 flex gap-3 text-xs text-zinc-500">
              <span>{fmtBytes(j.file_size)}</span>
              {j.duration_seconds !== null && <span>{fmtDur(j.duration_seconds)}</span>}
              {j.word_count !== null && <span>{j.word_count} words</span>}
              <span>{new Date(j.created_at).toLocaleDateString()}</span>
            </div>
            {j.error && <p className="mt-1 truncate text-xs text-red-400">{j.error}</p>}
          </button>
        ))}
      </div>
      {detailLoading && (
        <div className="w-96 flex items-center justify-center">
          <Loader variant="inline" label="Loading..." />
        </div>
      )}
      {detail && !detailLoading && (
        <div className="w-96 space-y-3 rounded border border-zinc-700 bg-zinc-800/50 p-4">
          <h3 className="font-medium text-zinc-200">{detail.filename}</h3>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
            <StatusBadge status={detail.status} />
            {detail.language && <span>Lang: {detail.language}</span>}
            {detail.model && <span>Model: {detail.model}</span>}
            <span>Duration: {fmtDur(detail.duration_seconds)}</span>
          </div>
          {detail.text && (
            <div className="max-h-48 overflow-y-auto rounded bg-zinc-900 p-3 text-sm text-zinc-300">
              {detail.text}
            </div>
          )}
          {detail.segments.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              <p className="text-xs font-medium text-zinc-400">Segments ({detail.segments.length})</p>
              {detail.segments.map((seg, i) => (
                <div key={i} className="rounded bg-zinc-900 px-2 py-1 text-xs">
                  <span className="mr-2 text-blue-400">{fmtDur(seg.start)}</span>
                  <span className="text-zinc-300">{seg.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: New Transcription
// ---------------------------------------------------------------------------

function NewTranscriptionTab(): React.JSX.Element {
  const [file, setFile] = useState<File | null>(null)
  const [lang, setLang] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const submit = useCallback(async () => {
    if (!file) return
    try {
      setUploading(true); setError(null)
      const d = await uploadFile(file, lang)
      setResult(d.job_id); setFile(null)
      if (ref.current) ref.current.value = ''
      log.info('Transcription submitted', { jobId: d.job_id })
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Upload failed'
      log.error(m); setError(m)
    } finally { setUploading(false) }
  }, [file, lang])

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Audio / Video File</label>
        <input ref={ref} type="file" accept={ALLOWED_EXT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-sm file:text-zinc-200" />
        <p className="mt-1 text-xs text-zinc-500">Supported: {ALLOWED_EXT}</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Language (optional)</label>
        <input type="text" value={lang} onChange={(e) => setLang(e.target.value)}
          placeholder="e.g. en, fr, de (auto-detect if empty)"
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600" />
      </div>
      {error && <div className="rounded bg-red-900/20 p-3 text-sm text-red-400">{error}</div>}
      {result && (
        <div className="rounded bg-emerald-900/20 p-3 text-sm text-emerald-400">
          Job submitted: <span className="font-mono">{result}</span>. Switch to Jobs tab to track.
        </div>
      )}
      <Button onClick={submit} disabled={!file || uploading} className="w-full">
        {uploading ? <><Loader variant="inline" /> <span className="ml-2">Uploading...</span></> : 'Upload & Transcribe'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Vision Analysis
// ---------------------------------------------------------------------------

function AnalysisTab(): React.JSX.Element {
  const [file, setFile] = useState<File | null>(null)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!file) return
    try {
      setBusy(true); setError(null); setResult(null)
      setResult((await analyzeImg(file, prompt)).description)
      log.info('Vision analysis complete')
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Analysis failed'
      log.error(m); setError(m)
    } finally { setBusy(false) }
  }, [file, prompt])

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Image File</label>
        <input type="file" accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-sm file:text-zinc-200" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Analysis Prompt</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe this image in detail." rows={3}
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600" />
      </div>
      {error && <div className="rounded bg-red-900/20 p-3 text-sm text-red-400">{error}</div>}
      {result && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-400">Analysis Result</p>
          <div className="rounded bg-zinc-900 p-4 text-sm leading-relaxed text-zinc-300">{result}</div>
        </div>
      )}
      <Button onClick={run} disabled={!file || busy} className="w-full">
        {busy ? <><Loader variant="inline" /> <span className="ml-2">Analyzing...</span></> : 'Analyze Image'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function VisionPanel(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('jobs')

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold text-zinc-100">Vision Intelligence</h2>
      <div className="flex gap-1 rounded-lg bg-zinc-800/50 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              activeTab === t.id ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'jobs' && <JobsTab />}
        {activeTab === 'new' && <NewTranscriptionTab />}
        {activeTab === 'analysis' && <AnalysisTab />}
      </div>
    </div>
  )
}
