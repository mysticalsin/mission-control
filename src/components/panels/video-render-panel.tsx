'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('VideoRenderPanel')

// ---------------------------------------------------------------------------
// Types (readonly -- immutable data flow)
// ---------------------------------------------------------------------------

interface RenderJob {
  readonly job_id: string
  readonly status: 'queued' | 'rendering' | 'done' | 'error'
  readonly progress: number
  readonly composition_id: string
  readonly output_url: string | null
  readonly error: string | null
  readonly file_size: number | null
  readonly created_at: number
}

interface TemplateProp {
  readonly type: string
  readonly default: unknown
  readonly label: string
  readonly min?: number
  readonly max?: number
}

interface VideoTemplate {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly duration_label: string
  readonly default_width: number
  readonly default_height: number
  readonly default_duration: number
  readonly default_fps: number
  readonly supports_brand: boolean
  readonly props: Record<string, TemplateProp>
}

type TabId = 'queue' | 'new' | 'templates'

const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'queue', label: 'Render Queue' },
  { id: 'new', label: 'New Render' },
  { id: 'templates', label: 'Templates' },
]

const STATUS_COLORS: Record<string, string> = {
  queued: 'text-yellow-400', rendering: 'text-blue-400',
  done: 'text-green-400', error: 'text-red-400',
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchJobs(): Promise<RenderJob[]> {
  const res = await fetch('/api/video-render')
  if (!res.ok) throw new Error('Failed to fetch render jobs')
  return ((await res.json()) as { jobs: RenderJob[] }).jobs
}

async function fetchTemplates(): Promise<VideoTemplate[]> {
  const res = await fetch('/api/video-render/templates')
  if (!res.ok) throw new Error('Failed to fetch templates')
  return ((await res.json()) as { templates: VideoTemplate[] }).templates
}

async function startRender(payload: {
  composition_id: string; props: Record<string, unknown>
  width: number; height: number; fps: number; duration_frames: number
}): Promise<{ job_id: string }> {
  const res = await fetch('/api/video-render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? 'Failed to start render')
  }
  return (await res.json()) as { job_id: string }
}

// ---------------------------------------------------------------------------
// Tiny helpers & sub-components
// ---------------------------------------------------------------------------

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '--'
  const units = ['B', 'KB', 'MB', 'GB']
  let idx = 0; let size = bytes
  while (size >= 1024 && idx < units.length - 1) { size /= 1024; idx++ }
  return `${size.toFixed(1)} ${units[idx]}`
}

function ProgressBar({ value }: { readonly value: number }): React.ReactElement {
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className="h-full rounded-full bg-blue-500 transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

function RenderStats({ jobs }: { readonly jobs: readonly RenderJob[] }): React.ReactElement | null {
  if (jobs.length === 0) return null
  const counts = [
    { label: 'Queued', color: 'text-yellow-400', n: jobs.filter((j) => j.status === 'queued').length },
    { label: 'Rendering', color: 'text-blue-400', n: jobs.filter((j) => j.status === 'rendering').length },
    { label: 'Done', color: 'text-green-400', n: jobs.filter((j) => j.status === 'done').length },
    { label: 'Errors', color: 'text-red-400', n: jobs.filter((j) => j.status === 'error').length },
  ]
  return (
    <div className="mb-4 grid grid-cols-4 gap-2">
      {counts.map((c) => (
        <div key={c.label} className="rounded-md border border-border bg-card p-2 text-center">
          <p className={`text-lg font-bold ${c.color}`}>{c.n}</p>
          <p className="text-xs text-muted-foreground">{c.label}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Render Queue Tab
// ---------------------------------------------------------------------------

function RenderQueueTab({ jobs, loading, error, onRefresh }: {
  readonly jobs: readonly RenderJob[]; readonly loading: boolean
  readonly error: string | null; readonly onRefresh: () => void
}): React.ReactElement {
  if (loading) return <div className="flex items-center justify-center py-12"><Loader variant="inline" /></div>
  if (error) return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <p className="text-sm text-red-400">{error}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRefresh}>Retry</Button>
    </div>
  )
  if (jobs.length === 0) return (
    <div className="py-12 text-center text-muted-foreground">
      <p className="text-lg">No render jobs yet</p>
      <p className="mt-1 text-sm">Create a new render to get started</p>
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{jobs.length} job(s)</span>
        <Button variant="ghost" size="sm" onClick={onRefresh}>Refresh</Button>
      </div>
      {jobs.map((job) => (
        <div key={job.job_id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold uppercase ${STATUS_COLORS[job.status] ?? ''}`}>{job.status}</span>
              <span className="text-sm font-medium text-foreground">{job.composition_id}</span>
              <span className="text-xs text-muted-foreground">#{job.job_id}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatBytes(job.file_size)}</span>
          </div>
          {(job.status === 'rendering' || job.status === 'queued') && (
            <div className="mt-2">
              <ProgressBar value={job.progress} />
              <span className="mt-1 block text-xs text-muted-foreground">{job.progress.toFixed(0)}%</span>
            </div>
          )}
          {job.status === 'done' && job.output_url && (
            <a href={job.output_url} target="_blank" rel="noopener noreferrer"
              className="mt-2 block text-xs text-blue-400 underline hover:text-blue-300">Preview / Download</a>
          )}
          {job.status === 'error' && job.error && <p className="mt-2 text-xs text-red-400">{job.error}</p>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prop Editor
// ---------------------------------------------------------------------------

function PropEditor({ props, values, onChange }: {
  readonly props: Record<string, TemplateProp>
  readonly values: Record<string, unknown>
  readonly onChange: (key: string, value: unknown) => void
}): React.ReactElement {
  const inputCls = 'w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground'
  return (
    <div className="space-y-3">
      {Object.entries(props).filter(([, p]) => p.type !== 'hidden').map(([key, prop]) => (
        <div key={key}>
          <label className="mb-1 block text-xs font-medium text-foreground">{prop.label}</label>
          {(prop.type === 'text' || prop.type === 'brand') && (
            <input type="text" value={String(values[key] ?? '')} onChange={(e) => onChange(key, e.target.value)} className={inputCls} />
          )}
          {prop.type === 'textarea' && (
            <textarea value={String(values[key] ?? '')} onChange={(e) => onChange(key, e.target.value)} rows={3} className={inputCls} />
          )}
          {prop.type === 'color' && (
            <input type="color" value={String(values[key] ?? '#000000')} onChange={(e) => onChange(key, e.target.value)}
              className="h-8 w-16 cursor-pointer rounded border border-border" />
          )}
          {prop.type === 'number' && (
            <input type="number" value={Number(values[key] ?? 0)} min={prop.min} max={prop.max}
              onChange={(e) => onChange(key, Number(e.target.value))} className="w-24 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground" />
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// New Render Tab
// ---------------------------------------------------------------------------

function NewRenderTab({ templates, templatesLoading, onSubmit }: {
  readonly templates: readonly VideoTemplate[]; readonly templatesLoading: boolean
  readonly onSubmit: (templateId: string, props: Record<string, unknown>) => void
}): React.ReactElement {
  const [selectedId, setSelectedId] = useState('')
  const [propValues, setPropValues] = useState<Record<string, unknown>>({})
  const selected = templates.find((t) => t.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return
    const defaults: Record<string, unknown> = {}
    for (const [key, prop] of Object.entries(selected.props)) { defaults[key] = prop.default }
    setPropValues(defaults)
  }, [selected])

  const handlePropChange = useCallback((key: string, value: unknown) => {
    setPropValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  if (templatesLoading) return <div className="flex items-center justify-center py-12"><Loader variant="inline" /></div>
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Template</label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
          <option value="">Select a template...</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.duration_label}, {t.category})</option>)}
        </select>
      </div>
      {selected && (
        <>
          <p className="text-xs text-muted-foreground">{selected.description}</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{selected.default_width}x{selected.default_height}</span>
            <span>{selected.default_fps} fps</span>
            <span>{selected.duration_label}</span>
          </div>
          <PropEditor props={selected.props} values={propValues} onChange={handlePropChange} />
          <Button onClick={() => onSubmit(selectedId, propValues)} className="w-full">Start Render</Button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Templates Browser Tab
// ---------------------------------------------------------------------------

function TemplatesTab({ templates, loading, error }: {
  readonly templates: readonly VideoTemplate[]; readonly loading: boolean; readonly error: string | null
}): React.ReactElement {
  if (loading) return <div className="flex items-center justify-center py-12"><Loader variant="inline" /></div>
  if (error) return <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4"><p className="text-sm text-red-400">{error}</p></div>
  if (templates.length === 0) return <div className="py-12 text-center text-muted-foreground"><p>No templates available</p></div>

  const grouped = templates.reduce<Record<string, VideoTemplate[]>>((acc, t) => {
    const cat = t.category || 'other'
    return { ...acc, [cat]: [...(acc[cat] ?? []), t] }
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="mb-2 text-sm font-semibold capitalize text-foreground">{category}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.duration_label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                  <span>{t.default_width}x{t.default_height}</span>
                  <span>{t.default_fps} fps</span>
                  {t.supports_brand && <span className="text-purple-400">Branded</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function VideoRenderPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('queue')
  const [jobs, setJobs] = useState<RenderJob[]>([])
  const [templates, setTemplates] = useState<VideoTemplate[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [submitStatus, setSubmitStatus] = useState<string | null>(null)

  const loadJobs = useCallback(async () => {
    setJobsLoading(true); setJobsError(null)
    try { setJobs(await fetchJobs()) }
    catch (err) { const m = err instanceof Error ? err.message : 'Unknown error'; log.error('Failed to load jobs', m); setJobsError(m) }
    finally { setJobsLoading(false) }
  }, [])

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true); setTemplatesError(null)
    try { setTemplates(await fetchTemplates()) }
    catch (err) { const m = err instanceof Error ? err.message : 'Unknown error'; log.error('Failed to load templates', m); setTemplatesError(m) }
    finally { setTemplatesLoading(false) }
  }, [])

  useEffect(() => { void loadJobs(); void loadTemplates() }, [loadJobs, loadTemplates])

  // Auto-refresh while renders are active
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'rendering')
    if (!hasActive) return
    const id = setInterval(() => { void loadJobs() }, 5000)
    return () => clearInterval(id)
  }, [jobs, loadJobs])

  const handleSubmitRender = useCallback(async (templateId: string, props: Record<string, unknown>) => {
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) return
    setSubmitStatus('Starting render...')
    try {
      const r = await startRender({ composition_id: templateId, props, width: tpl.default_width, height: tpl.default_height, fps: tpl.default_fps, duration_frames: tpl.default_duration })
      setSubmitStatus(`Render started: #${r.job_id}`); setActiveTab('queue'); void loadJobs()
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Render failed'; log.error('Render submit failed', m); setSubmitStatus(`Error: ${m}`)
    }
  }, [templates, loadJobs])

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold text-foreground">Video Rendering</h2>
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {tab.label}
          </button>
        ))}
      </div>
      {submitStatus && (
        <div className={`rounded-md border px-3 py-2 text-xs ${submitStatus.startsWith('Error') ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-blue-500/30 bg-blue-500/10 text-blue-400'}`}>
          {submitStatus}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'queue' && <><RenderStats jobs={jobs} /><RenderQueueTab jobs={jobs} loading={jobsLoading} error={jobsError} onRefresh={loadJobs} /></>}
        {activeTab === 'new' && <NewRenderTab templates={templates} templatesLoading={templatesLoading} onSubmit={handleSubmitRender} />}
        {activeTab === 'templates' && <TemplatesTab templates={templates} loading={templatesLoading} error={templatesError} />}
      </div>
    </div>
  )
}
