'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('Scraping')

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'jobs' | 'new' | 'scheduled'
type JobStatus = 'pending' | 'running' | 'completed' | 'failed'
type ScrapeMode = 'quick' | 'stealth' | 'full'

interface ScrapeJob {
  readonly id: string
  readonly url: string
  readonly mode: ScrapeMode
  readonly status: JobStatus
  readonly error: string | null
  readonly created_at: string | null
  readonly completed_at: string | null
  readonly has_result: boolean
}

interface ScrapeJobDetail {
  readonly id: string
  readonly url: string
  readonly mode: ScrapeMode
  readonly status: JobStatus
  readonly result: ScrapeResult
  readonly error: string | null
  readonly selectors: readonly string[]
  readonly extract_links: boolean
  readonly extract_images: boolean
  readonly created_at: string | null
  readonly completed_at: string | null
}

interface ScrapeResult {
  readonly title?: string
  readonly headings?: readonly string[]
  readonly links?: readonly string[]
  readonly images?: readonly string[]
  readonly text?: string
  readonly selector_results?: Record<string, string>
}

interface HealthInfo {
  readonly engine: string
  readonly available: boolean
  readonly supported_modes: readonly string[]
  readonly active_jobs: number
}

interface ScrapeFormState {
  readonly url: string
  readonly mode: ScrapeMode
  readonly selectors: string
  readonly extractLinks: boolean
  readonly extractImages: boolean
}

// ── Shared constants ─────────────────────────────────────────────────────────

const INPUT =
  'px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

const DIM = 'bg-secondary text-muted-foreground border-border'
const GREEN = 'bg-green-500/20 text-green-400 border-green-500/30'
const AMBER = 'bg-amber-500/20 text-amber-400 border-amber-500/30'
const BLUE = 'bg-blue-500/20 text-blue-400 border-blue-500/30'
const RED = 'bg-red-500/20 text-red-400 border-red-500/30'

const STATUS_BADGE: Record<JobStatus, string> = {
  pending: AMBER,
  running: BLUE,
  completed: GREEN,
  failed: RED,
}

const MODE_BADGE: Record<ScrapeMode, string> = {
  quick: DIM,
  stealth: AMBER,
  full: BLUE,
}

// ── Micro components ─────────────────────────────────────────────────────────

const Badge = ({ label, cls }: { readonly label: string; readonly cls: string }): React.JSX.Element => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
    {label}
  </span>
)

const Empty = ({ msg }: { readonly msg: string }): React.JSX.Element => (
  <div className="text-center py-12 text-muted-foreground text-sm">{msg}</div>
)

const INITIAL_FORM: ScrapeFormState = {
  url: '',
  mode: 'quick',
  selectors: '',
  extractLinks: true,
  extractImages: true,
}

// ── Main component ───────────────────────────────────────────────────────────

export function ScrapingPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('jobs')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<readonly ScrapeJob[]>([])
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [selectedJob, setSelectedJob] = useState<ScrapeJobDetail | null>(null)
  const [form, setForm] = useState<ScrapeFormState>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)

  const loadJobs = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch('/api/scraping')
      if (!res.ok) throw new Error(`Failed to load jobs: ${res.status}`)
      const data = await res.json()
      setJobs(data.jobs ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load scraping jobs'
      log.error(message)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadHealth = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/scraping/health')
      if (!res.ok) return
      const data = await res.json()
      // Safely extract primitive values — API may return nested objects
      const engine = typeof data.engine === 'string' ? data.engine :
        (data.engine && typeof data.engine === 'object' ? JSON.stringify(data.engine) : 'unknown')
      const supportedModes = Array.isArray(data.supported_modes)
        ? data.supported_modes.map((m: unknown) => typeof m === 'string' ? m : String(m))
        : []
      const activeJobs = typeof data.active_jobs === 'number' ? data.active_jobs : 0
      const available = typeof data.available === 'boolean' ? data.available : true
      setHealth({ engine, available, supported_modes: supportedModes, active_jobs: activeJobs })
    } catch {
      // Health is non-critical, silent fail
    }
  }, [])

  useEffect(() => {
    void loadJobs()
    void loadHealth()
  }, [loadJobs, loadHealth])

  const viewJobDetail = useCallback(async (jobId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/scraping/jobs?id=${encodeURIComponent(jobId)}`)
      if (!res.ok) throw new Error(`Failed to load job: ${res.status}`)
      const data: ScrapeJobDetail = await res.json()
      setSelectedJob(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load job details'
      log.error(message)
      setError(message)
    }
  }, [])

  const deleteJob = useCallback(async (jobId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/scraping/jobs?id=${encodeURIComponent(jobId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Failed to delete job: ${res.status}`)
      setJobs((prev) => prev.filter((j) => j.id !== jobId))
      if (selectedJob?.id === jobId) setSelectedJob(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete job'
      log.error(message)
      setError(message)
    }
  }, [selectedJob])

  const submitScrape = useCallback(async (): Promise<void> => {
    if (!form.url.trim()) {
      setError('URL is required')
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      const selectors = form.selectors
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

      const res = await fetch('/api/scraping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: form.url.trim(),
          mode: form.mode,
          selectors: selectors.length > 0 ? selectors : undefined,
          extract_links: form.extractLinks,
          extract_images: form.extractImages,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Scrape failed: ${res.status}`)
      }
      setForm(INITIAL_FORM)
      setTab('jobs')
      await loadJobs()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start scrape'
      log.error(message)
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }, [form, loadJobs])

  const updateForm = useCallback(
    <K extends keyof ScrapeFormState>(key: K, value: ScrapeFormState[K]): void => {
      setForm((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  // ── Render ──────────────────────────────────────────────────────────────

  const tabs: readonly { readonly key: Tab; readonly label: string }[] = [
    { key: 'jobs', label: 'Scrape Jobs' },
    { key: 'new', label: 'New Scrape' },
    { key: 'scheduled', label: 'Scheduled' },
  ]

  return (
    <div className="space-y-4">
      {/* Health banner */}
      {health && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Badge label={health.engine} cls={health.available ? GREEN : RED} />
          <span>Active jobs: {health.active_jobs}</span>
          <span>Modes: {health.supported_modes.join(', ')}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-px">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${
              tab === t.key
                ? 'bg-secondary text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-xs">
            dismiss
          </button>
        </div>
      )}

      {/* Tab content */}
      {tab === 'jobs' && (
        <JobsTab
          jobs={jobs}
          isLoading={isLoading}
          selectedJob={selectedJob}
          onRefresh={loadJobs}
          onView={viewJobDetail}
          onDelete={deleteJob}
          onCloseDetail={() => setSelectedJob(null)}
        />
      )}
      {tab === 'new' && (
        <NewScrapeTab
          form={form}
          submitting={submitting}
          onUpdateForm={updateForm}
          onSubmit={submitScrape}
        />
      )}
      {tab === 'scheduled' && <ScheduledTab />}
    </div>
  )
}

// ── Jobs Tab ─────────────────────────────────────────────────────────────────

function JobsTab({
  jobs,
  isLoading,
  selectedJob,
  onRefresh,
  onView,
  onDelete,
  onCloseDetail,
}: {
  readonly jobs: readonly ScrapeJob[]
  readonly isLoading: boolean
  readonly selectedJob: ScrapeJobDetail | null
  readonly onRefresh: () => Promise<void>
  readonly onView: (id: string) => Promise<void>
  readonly onDelete: (id: string) => Promise<void>
  readonly onCloseDetail: () => void
}): React.JSX.Element {
  if (isLoading) return <Loader label="Loading scrape jobs..." />
  if (jobs.length === 0) return <Empty msg="No scrape jobs yet. Start one from the New Scrape tab." />

  if (selectedJob) {
    return <JobDetail job={selectedJob} onClose={onCloseDetail} />
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      {jobs.map((job) => (
        <div
          key={job.id}
          className="flex items-center justify-between p-3 rounded-md border border-border bg-card hover:bg-secondary/50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Badge label={job.status} cls={STATUS_BADGE[job.status]} />
            <Badge label={job.mode} cls={MODE_BADGE[job.mode]} />
            <span className="text-sm truncate max-w-[280px]" title={job.url}>
              {job.url}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {job.created_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(job.created_at).toLocaleString()}
              </span>
            )}
            {job.has_result && (
              <Button variant="ghost" size="sm" onClick={() => onView(job.id)}>
                View
              </Button>
            )}
            {job.status !== 'pending' && job.status !== 'running' && (
              <Button variant="ghost" size="sm" onClick={() => onDelete(job.id)}>
                Delete
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Job Detail ───────────────────────────────────────────────────────────────

function JobDetail({
  job,
  onClose,
}: {
  readonly job: ScrapeJobDetail
  readonly onClose: () => void
}): React.JSX.Element {
  const result = job.result
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge label={job.status} cls={STATUS_BADGE[job.status as JobStatus]} />
          <Badge label={job.mode} cls={MODE_BADGE[job.mode as ScrapeMode]} />
          <span className="text-sm font-medium truncate max-w-[300px]">{job.url}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Back
        </Button>
      </div>

      {job.error && (
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {job.error}
        </div>
      )}

      {result.title && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Title</h4>
          <p className="text-sm">{result.title}</p>
        </div>
      )}

      {result.headings && result.headings.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">
            Headings ({result.headings.length})
          </h4>
          <ul className="text-sm space-y-0.5 max-h-40 overflow-y-auto">
            {result.headings.map((h, i) => (
              <li key={i} className="text-muted-foreground">{h}</li>
            ))}
          </ul>
        </div>
      )}

      {result.links && result.links.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">
            Links ({result.links.length})
          </h4>
          <ul className="text-sm space-y-0.5 max-h-40 overflow-y-auto">
            {result.links.slice(0, 50).map((link, i) => (
              <li key={i} className="truncate text-blue-400">{link}</li>
            ))}
            {result.links.length > 50 && (
              <li className="text-muted-foreground">...and {result.links.length - 50} more</li>
            )}
          </ul>
        </div>
      )}

      {result.text && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Text Content</h4>
          <pre className="text-xs bg-secondary p-3 rounded-md max-h-60 overflow-y-auto whitespace-pre-wrap">
            {result.text.slice(0, 5000)}
            {result.text.length > 5000 && '\n\n... truncated'}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── New Scrape Tab ───────────────────────────────────────────────────────────

function NewScrapeTab({
  form,
  submitting,
  onUpdateForm,
  onSubmit,
}: {
  readonly form: ScrapeFormState
  readonly submitting: boolean
  readonly onUpdateForm: <K extends keyof ScrapeFormState>(key: K, val: ScrapeFormState[K]) => void
  readonly onSubmit: () => Promise<void>
}): React.JSX.Element {
  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Target URL</label>
        <input
          type="url"
          className={`w-full ${INPUT}`}
          placeholder="https://example.com"
          value={form.url}
          onChange={(e) => onUpdateForm('url', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Scrape Mode</label>
        <select
          className={`w-full ${INPUT}`}
          value={form.mode}
          onChange={(e) => onUpdateForm('mode', e.target.value as ScrapeMode)}
        >
          <option value="quick">Quick -- HTTP fetch + parse (fastest)</option>
          <option value="stealth">Stealth -- bypass bot detection</option>
          <option value="full">Full -- JS render with browser</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          CSS Selectors (one per line, optional)
        </label>
        <textarea
          className={`w-full ${INPUT} min-h-[80px]`}
          placeholder={'.article-title\n.price\n#main-content'}
          value={form.selectors}
          onChange={(e) => onUpdateForm('selectors', e.target.value)}
        />
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.extractLinks}
            onChange={(e) => onUpdateForm('extractLinks', e.target.checked)}
          />
          Extract links
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.extractImages}
            onChange={(e) => onUpdateForm('extractImages', e.target.checked)}
          />
          Extract images
        </label>
      </div>

      <Button onClick={onSubmit} disabled={submitting || !form.url.trim()}>
        {submitting ? 'Starting...' : 'Start Scrape'}
      </Button>
    </div>
  )
}

// ── Scheduled Tab (placeholder) ──────────────────────────────────────────────

function ScheduledTab(): React.JSX.Element {
  return (
    <Empty msg="Scheduled scrapes coming soon. Use the Jarvis API directly for recurring jobs." />
  )
}
