'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('Marketing')

// ── Types ────────────────────────────────────────────────────────────────────

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted'
type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'
type CampaignType = 'email' | 'social' | 'content' | 'event'
type Tab = 'leads' | 'signals' | 'campaigns' | 'pipeline'

interface Lead {
  readonly id: number; readonly name: string; readonly company: string
  readonly email: string; readonly status: LeadStatus; readonly source: string; readonly score: number
}
interface Signal {
  readonly id: number; readonly signal_type: string; readonly company: string
  readonly description: string; readonly confidence: number; readonly source_url: string
}
interface Campaign {
  readonly id: number; readonly name: string; readonly type: CampaignType
  readonly status: CampaignStatus; readonly budget: number; readonly spent: number
  readonly leads_generated: number; readonly conversion_rate: number
}
interface FunnelData { readonly new: number; readonly contacted: number; readonly qualified: number; readonly converted: number }

// Pipeline types — mirrors Jarvis 5-phase marketing pipeline
interface AgentPhase {
  readonly agent_id: string; readonly agent_name: string
  readonly status: 'pending' | 'running' | 'completed' | 'failed'
  readonly message: string; readonly duration_ms: number
}
interface PipelineJob {
  readonly id: string; readonly status: 'pending' | 'running' | 'completed' | 'failed'
  readonly current_phase: number; readonly phases: readonly AgentPhase[]
  readonly quality_score: number; readonly download_url: string
  readonly error: string
}

// ── Shared constants ─────────────────────────────────────────────────────────

const INPUT = 'px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'
const SELECT = `${INPUT} appearance-none cursor-pointer`

const LEAD_BADGE: Record<LeadStatus, string> = {
  new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  contacted: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  qualified: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  converted: 'bg-green-500/20 text-green-400 border-green-500/30',
}
const CAMPAIGN_BADGE: Record<CampaignStatus, string> = {
  draft: 'bg-secondary text-muted-foreground border-border',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}
const PHASE_NAMES = [
  'CMO Prompt Scan', 'Gamma Builder', 'Template Application', 'Validation', 'Brand Confirmation',
] as const

// ── Micro components ─────────────────────────────────────────────────────────

function Badge({ label, cls }: { readonly label: string; readonly cls: string }): React.JSX.Element {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>
}
function Empty({ msg }: { readonly msg: string }): React.JSX.Element {
  return <div className="text-center py-12 text-muted-foreground text-sm">{msg}</div>
}

// ── Main component ───────────────────────────────────────────────────────────

export function MarketingPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('pipeline')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [funnel, setFunnel] = useState<FunnelData | null>(null)

  const loadData = useCallback(async (): Promise<void> => {
    if (tab === 'pipeline') { setIsLoading(false); return }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing?tab=${tab}`)
      if (!res.ok) throw new Error(`Failed to load ${tab}`)
      const data = await res.json()
      if (tab === 'leads') {
        setLeads(data.leads ?? [])
        fetch('/api/marketing?tab=funnel').then(r => r.json()).then(d => setFunnel(d.funnel ?? null)).catch(() => null)
      } else if (tab === 'signals') { setSignals(data.signals ?? [])
      } else if (tab === 'campaigns') { setCampaigns(data.campaigns ?? []) }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Marketing data load failed:', err)
      setError(message)
    } finally { setIsLoading(false) }
  }, [tab])

  useEffect(() => { loadData() }, [loadData])

  const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: 'pipeline', label: 'Presentation Pipeline' },
    { key: 'leads', label: 'Leads' }, { key: 'signals', label: 'Signals' },
    { key: 'campaigns', label: 'Campaigns' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Marketing Studio</h1>
            <p className="text-muted-foreground mt-1">CMO-driven presentation pipeline, leads, signals &amp; campaigns</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
            {tab !== 'pipeline' && <Button onClick={loadData} variant="outline" size="sm">Refresh</Button>}
          </div>
        </div>
      </div>

      {tab === 'pipeline' ? (
        <PipelineTab />
      ) : error ? (
        <div className="text-center py-12">
          <div className="text-lg text-red-400 mb-2">Failed to load data</div>
          <div className="text-sm text-muted-foreground mb-4">{error}</div>
          <Button onClick={loadData} variant="outline" size="sm">Retry</Button>
        </div>
      ) : isLoading ? (
        <Loader variant="panel" label="Loading marketing data" />
      ) : tab === 'leads' ? (
        <LeadsTab leads={leads} funnel={funnel} onRefresh={loadData} />
      ) : tab === 'signals' ? (
        <SignalsTab signals={signals} />
      ) : (
        <CampaignsTab campaigns={campaigns} onRefresh={loadData} />
      )}
    </div>
  )
}

// ── Pipeline tab — 5-phase CMO-driven presentation generation ────────────────

interface PipelineForm {
  readonly content: string; readonly n_slides: string; readonly tone: string
  readonly verbosity: string; readonly language: string; readonly pptx_template: string
  readonly export_as: string; readonly image_source: string; readonly text_mode: string
  readonly instructions: string
}

const DEFAULT_FORM: PipelineForm = {
  content: '', n_slides: '10', tone: 'professional', verbosity: 'medium',
  language: 'en', pptx_template: 'amaris_template', export_as: 'pptx',
  image_source: 'aiGenerated', text_mode: 'generate', instructions: '',
}

// Webhook types for pipeline notifications
type WebhookPlatform = 'discord' | 'teams' | 'slack'
interface MarketingWebhook {
  readonly id: number
  readonly platform: WebhookPlatform
  readonly url: string
  readonly enabled: number
}

function PipelineTab(): React.JSX.Element {
  const [jobs, setJobs] = useState<PipelineJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<PipelineForm>(DEFAULT_FORM)
  const [activeJob, setActiveJob] = useState<PipelineJob | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadJobs = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/marketing/pipeline?action=jobs')
      if (!res.ok) throw new Error('Failed to load pipeline jobs')
      const data = await res.json()
      setJobs(data.jobs ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load jobs'
      log.error(message)
      setError(message)
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { loadJobs() }, [loadJobs])

  // Poll active job status
  useEffect(() => {
    if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'failed') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/marketing/pipeline?action=status&job_id=${encodeURIComponent(activeJob.id)}`)
        if (!res.ok) return
        const data: PipelineJob = await res.json()
        setActiveJob(data)
        if (data.status === 'completed' || data.status === 'failed') {
          void loadJobs()
          // Dispatch webhook notifications for completed jobs
          if (data.status === 'completed' && data.download_url) {
            void triggerWebhooks(data.id, data.quality_score, data.download_url)
          }
        }
      } catch { /* polling failure is non-critical */ }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeJob, loadJobs])

  const handleGenerate = async (): Promise<void> => {
    if (!form.content.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/marketing/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: form.content,
          n_slides: Number(form.n_slides),
          tone: form.tone,
          verbosity: form.verbosity,
          language: form.language,
          pptx_template: form.pptx_template,
          export_as: form.export_as,
          image_source: form.image_source,
          text_mode: form.text_mode,
          instructions: form.instructions || undefined,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Generation request failed' }))
        throw new Error(typeof errData.error === 'string' ? errData.error : 'Generation request failed')
      }
      const data = await res.json()
      setActiveJob(data as PipelineJob)
      setShowForm(false)
      setForm(DEFAULT_FORM)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Pipeline generation failed:', err)
      setError(message)
    } finally { setBusy(false) }
  }

  const handleDownload = async (url: string): Promise<void> => {
    const filename = url.split('/').pop() || 'presentation.pptx'
    window.open(`/api/marketing/pipeline?action=download&filename=${encodeURIComponent(filename)}`, '_blank')
  }

  const handleDelete = async (jobId: string): Promise<void> => {
    try {
      const res = await fetch('/api/marketing/pipeline', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Delete failed' }))
        throw new Error(typeof errData.error === 'string' ? errData.error : 'Delete failed')
      }
      // Remove from local state immediately for responsive UI
      setJobs(prev => prev.filter(j => j.id !== jobId))
      if (activeJob?.id === jobId) setActiveJob(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Pipeline delete failed:', err)
      setError(message)
    }
  }

  /** Trigger server-side webhook dispatch for a completed presentation. */
  const triggerWebhooks = async (jobId: string, qualityScore: number, downloadUrl: string): Promise<void> => {
    try {
      await fetch('/api/marketing/pipeline/webhook/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, quality_score: qualityScore, download_url: downloadUrl }),
      })
    } catch {
      // Webhook dispatch failure is non-critical — don't block user flow
    }
  }

  const updateField = <K extends keyof PipelineForm>(key: K, value: PipelineForm[K]): void => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      {/* Active job tracker */}
      {activeJob && (activeJob.status === 'pending' || activeJob.status === 'running') && (
        <ActiveJobTracker job={activeJob} />
      )}

      {/* Completed active job */}
      {activeJob && activeJob.status === 'completed' && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-400">Generation Complete</span>
            </div>
            <QualityBadge score={activeJob.quality_score} />
          </div>
          <PhaseList phases={activeJob.phases} />
          {activeJob.download_url && (
            <Button size="sm" onClick={() => handleDownload(activeJob.download_url)}>
              Download {form.export_as.toUpperCase()}
            </Button>
          )}
          <button onClick={() => setActiveJob(null)} className="text-xs text-muted-foreground hover:text-foreground ml-3">
            Dismiss
          </button>
        </div>
      )}

      {/* Failed active job */}
      {activeJob && activeJob.status === 'failed' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm font-medium text-red-400">Generation Failed</span>
          </div>
          <p className="text-xs text-muted-foreground">{activeJob.error || 'Unknown pipeline error'}</p>
          <PhaseList phases={activeJob.phases} />
          <button onClick={() => setActiveJob(null)} className="text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      )}

      {/* Generate form toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            {PHASE_NAMES.map((name, i) => (
              <span key={name} className="flex items-center gap-1 text-muted-foreground">
                {i > 0 && <span className="text-border">→</span>}
                <span className="text-xs">{name}</span>
              </span>
            ))}
          </div>
        </div>
        <Button size="sm" variant={showForm ? 'outline' : 'default'} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Hide Form' : '+ New Presentation'}
        </Button>
      </div>

      {error && !activeJob && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">{error}</div>
      )}

      {showForm && (
        <GenerateForm form={form} busy={busy} onUpdate={updateField} onGenerate={handleGenerate} />
      )}

      {/* Job history */}
      {isLoading ? (
        <Loader variant="panel" label="Loading pipeline jobs" />
      ) : jobs.length === 0 && !activeJob ? (
        <Empty msg="No pipeline jobs yet — generate your first presentation above" />
      ) : (
        <JobHistory jobs={jobs} onDownload={handleDownload} onDelete={handleDelete} />
      )}

      {/* Webhook configuration */}
      <WebhookConfig />
    </div>
  )
}

// ── Pipeline sub-components ──────────────────────────────────────────────────

function GenerateForm({ form, busy, onUpdate, onGenerate }: {
  readonly form: PipelineForm; readonly busy: boolean
  readonly onUpdate: <K extends keyof PipelineForm>(key: K, value: PipelineForm[K]) => void
  readonly onGenerate: () => void
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary" />
        <span className="text-sm font-semibold text-foreground">Create Presentation</span>
        <span className="text-xs text-muted-foreground ml-auto">Powered by Jarvis CMO Pipeline</span>
      </div>

      {/* Topic/content */}
      <textarea
        className={`${INPUT} w-full resize-none`} rows={4}
        placeholder="What should this presentation be about? Describe the topic, key points, target audience, and any specific requirements…"
        value={form.content} onChange={e => onUpdate('content', e.target.value)}
      />

      {/* Settings grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Slides</label>
          <input className={INPUT} type="number" min={3} max={60} value={form.n_slides}
            onChange={e => onUpdate('n_slides', e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tone</label>
          <select className={SELECT} value={form.tone} onChange={e => onUpdate('tone', e.target.value)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="formal">Formal</option>
            <option value="creative">Creative</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Verbosity</label>
          <select className={SELECT} value={form.verbosity} onChange={e => onUpdate('verbosity', e.target.value)}>
            <option value="concise">Concise</option>
            <option value="medium">Medium</option>
            <option value="detailed">Detailed</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Language</label>
          <select className={SELECT} value={form.language} onChange={e => onUpdate('language', e.target.value)}>
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
            <option value="de">German</option>
            <option value="zh">Chinese</option>
            <option value="ja">Japanese</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Template</label>
          <select className={SELECT} value={form.pptx_template} onChange={e => onUpdate('pptx_template', e.target.value)}>
            <option value="amaris_template">Amaris Corporate</option>
            <option value="mantu_template">Mantu Group</option>
            <option value="none">No Template</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Export</label>
          <select className={SELECT} value={form.export_as} onChange={e => onUpdate('export_as', e.target.value)}>
            <option value="pptx">PPTX</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Images</label>
          <select className={SELECT} value={form.image_source} onChange={e => onUpdate('image_source', e.target.value)}>
            <option value="aiGenerated">AI Generated</option>
            <option value="webAllImages">Web Images</option>
            <option value="none">No Images</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Text Mode</label>
          <select className={SELECT} value={form.text_mode} onChange={e => onUpdate('text_mode', e.target.value)}>
            <option value="generate">Generate</option>
            <option value="condense">Condense</option>
            <option value="preserve">Preserve</option>
          </select>
        </div>
      </div>

      {/* Additional instructions */}
      <textarea
        className={`${INPUT} w-full resize-none`} rows={2}
        placeholder="Additional instructions for the CMO agent (optional, max 2000 chars)…"
        maxLength={2000} value={form.instructions}
        onChange={e => onUpdate('instructions', e.target.value)}
      />

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={onGenerate} disabled={busy || !form.content.trim()}>
          {busy ? 'Launching Pipeline…' : 'Generate Presentation'}
        </Button>
        <span className="text-xs text-muted-foreground">
          5-phase AI pipeline: scan → build → template → validate → brand
        </span>
      </div>
    </div>
  )
}

function ActiveJobTracker({ job }: { readonly job: PipelineJob }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3 animate-pulse-slow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm font-medium text-blue-400">
            Pipeline Running — Phase {job.current_phase + 1}/5
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">{job.id}</span>
      </div>
      <PhaseList phases={job.phases} currentPhase={job.current_phase} />
    </div>
  )
}

function PhaseList({ phases, currentPhase }: {
  readonly phases: readonly AgentPhase[]; readonly currentPhase?: number
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      {PHASE_NAMES.map((name, idx) => {
        const phase = phases[idx]
        const status = phase?.status ?? 'pending'
        const isCurrent = currentPhase === idx && status === 'running'
        const durationSec = phase?.duration_ms ? (phase.duration_ms / 1000).toFixed(1) : null

        return (
          <div key={name} className={`flex items-center gap-2 text-xs ${isCurrent ? 'text-blue-400' : status === 'completed' ? 'text-green-400' : status === 'failed' ? 'text-red-400' : 'text-muted-foreground'}`}>
            <PhaseIcon status={status} isCurrent={isCurrent} />
            <span className="font-medium w-40">{name}</span>
            {phase?.agent_name && <span className="text-muted-foreground">{phase.agent_name}</span>}
            {durationSec && <span className="text-muted-foreground ml-auto">{durationSec}s</span>}
            {phase?.message && status === 'failed' && (
              <span className="text-red-400/70 truncate max-w-[200px] ml-2">{phase.message}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PhaseIcon({ status, isCurrent }: {
  readonly status: string; readonly isCurrent: boolean
}): React.JSX.Element {
  if (isCurrent) return <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
  if (status === 'completed') return <span className="text-green-500">&#10003;</span>
  if (status === 'failed') return <span className="text-red-500">&#10007;</span>
  return <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
}

function QualityBadge({ score }: { readonly score: number }): React.JSX.Element {
  const pct = Math.round(score * 100)
  const cls = pct >= 80 ? 'bg-green-500/20 text-green-400 border-green-500/30'
    : pct >= 50 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : 'bg-red-500/20 text-red-400 border-red-500/30'
  return <Badge label={`Quality: ${pct}%`} cls={cls} />
}

function JobHistory({ jobs, onDownload, onDelete }: {
  readonly jobs: readonly PipelineJob[]
  readonly onDownload: (url: string) => void
  readonly onDelete: (jobId: string) => void
}): React.JSX.Element {
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const statusBadge: Record<string, string> = {
    pending: 'bg-secondary text-muted-foreground border-border',
    running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pipeline History</div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {jobs.map(job => (
          <div key={job.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-mono text-muted-foreground">{job.id}</span>
              <div className="flex items-center gap-2">
                <Badge label={job.status} cls={statusBadge[job.status] ?? statusBadge.pending} />
                {confirmId === job.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { onDelete(job.id); setConfirmId(null) }}
                      className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-xs px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(job.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                    title="Delete presentation"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Phase {Math.min(job.current_phase + 1, 5)}/5</span>
              {job.quality_score > 0 && <QualityBadge score={job.quality_score} />}
            </div>
            {job.status === 'completed' && job.download_url && (
              <Button size="sm" variant="outline" onClick={() => onDownload(job.download_url)}>
                Download
              </Button>
            )}
            {job.status === 'failed' && job.error && (
              <p className="text-xs text-red-400/70 line-clamp-2">{job.error}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Webhook configuration ────────────────────────────────────────────────────

const PLATFORMS: ReadonlyArray<{ key: WebhookPlatform; label: string; placeholder: string }> = [
  { key: 'discord', label: 'Discord', placeholder: 'https://discord.com/api/webhooks/...' },
  { key: 'teams', label: 'Microsoft Teams', placeholder: 'https://outlook.office.com/webhook/...' },
  { key: 'slack', label: 'Slack', placeholder: 'https://hooks.slack.com/services/...' },
]

function WebhookConfig(): React.JSX.Element {
  const [webhooks, setWebhooks] = useState<MarketingWebhook[]>([])
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newPlatform, setNewPlatform] = useState<WebhookPlatform>('discord')
  const [newUrl, setNewUrl] = useState('')
  const [webhookError, setWebhookError] = useState<string | null>(null)

  const loadWebhooks = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/marketing/pipeline/webhook')
      if (!res.ok) return
      const data = await res.json()
      setWebhooks(data.webhooks ?? [])
    } catch {
      // Non-critical — webhook config is optional
    }
  }, [])

  useEffect(() => { loadWebhooks() }, [loadWebhooks])

  const handleSave = async (): Promise<void> => {
    if (!newUrl.trim()) return
    setSaving(true)
    setWebhookError(null)
    try {
      const res = await fetch('/api/marketing/pipeline/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: newPlatform, url: newUrl.trim() }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Save failed' }))
        throw new Error(typeof errData.error === 'string' ? errData.error : 'Save failed')
      }
      setNewUrl('')
      await loadWebhooks()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setWebhookError(message)
    } finally { setSaving(false) }
  }

  const handleRemove = async (id: number): Promise<void> => {
    try {
      await fetch('/api/marketing/pipeline/webhook', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setWebhooks(prev => prev.filter(w => w.id !== id))
    } catch {
      // Non-critical
    }
  }

  // Filter out platforms that already have a webhook configured
  const configuredPlatforms = new Set(webhooks.map(w => w.platform))

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="text-sm font-medium text-foreground">Webhook Notifications</span>
          {webhooks.length > 0 && (
            <span className="text-xs text-muted-foreground">({webhooks.length} configured)</span>
          )}
        </div>
        <svg className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Push completed presentations to Discord, Microsoft Teams, or Slack automatically.
          </p>

          {/* Existing webhooks */}
          {webhooks.map(wh => {
            const platformInfo = PLATFORMS.find(p => p.key === wh.platform)
            return (
              <div key={wh.id} className="flex items-center gap-2 text-sm">
                <Badge
                  label={platformInfo?.label ?? wh.platform}
                  cls="bg-primary/10 text-primary border-primary/20"
                />
                <span className="text-xs text-muted-foreground truncate flex-1" title={wh.url}>
                  {wh.url}
                </span>
                <button
                  onClick={() => handleRemove(wh.id)}
                  className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                  title="Remove webhook"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}

          {/* Add new webhook */}
          {configuredPlatforms.size < 3 && (
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Platform</label>
                <select
                  className={SELECT}
                  value={newPlatform}
                  onChange={e => setNewPlatform(e.target.value as WebhookPlatform)}
                >
                  {PLATFORMS.filter(p => !configuredPlatforms.has(p.key)).map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 flex-1">
                <label className="text-xs text-muted-foreground">Webhook URL</label>
                <input
                  className={`${INPUT} w-full`}
                  placeholder={PLATFORMS.find(p => p.key === newPlatform)?.placeholder ?? 'https://...'}
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving || !newUrl.trim()}>
                {saving ? 'Saving...' : 'Add'}
              </Button>
            </div>
          )}

          {webhookError && (
            <p className="text-xs text-red-400">{webhookError}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Leads tab ────────────────────────────────────────────────────────────────

function LeadsTab({ leads, funnel, onRefresh }: {
  readonly leads: Lead[]; readonly funnel: FunnelData | null; readonly onRefresh: () => void
}): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', email: '', source: '', score: '0' })

  const filtered = search
    ? leads.filter(l => [l.name, l.company, l.email].some(v => v.toLowerCase().includes(search.toLowerCase())))
    : leads

  const handleAdd = async (): Promise<void> => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/marketing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_lead', name: form.name, company: form.company, email: form.email, source: form.source, score: Number(form.score) }),
      })
      if (!res.ok) throw new Error('Failed to create lead')
      setForm({ name: '', company: '', email: '', source: '', score: '0' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create lead failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {funnel && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Funnel Overview</div>
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {([['new','bg-blue-500'],['contacted','bg-amber-500'],['qualified','bg-purple-500'],['converted','bg-green-500']] as const).map(([k,c]) => {
              const total = (funnel.new + funnel.contacted + funnel.qualified + funnel.converted) || 1
              return <div key={k} className={`${c} transition-all`} style={{ width: `${(funnel[k] / total) * 100}%` }} />
            })}
          </div>
          <div className="flex gap-4 flex-wrap">
            {([['new','bg-blue-500','New'],['contacted','bg-amber-500','Contacted'],['qualified','bg-purple-500','Qualified'],['converted','bg-green-500','Converted']] as const).map(([k,c,l]) => (
              <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${c}`} /><span>{l}:</span><span className="font-medium text-foreground">{funnel[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <input type="text" placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} className={`${INPUT} flex-1 max-w-xs`} />
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Lead'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Lead</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={INPUT} placeholder="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            <input className={INPUT} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className={INPUT} placeholder="Source" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} />
            <input className={INPUT} type="number" min={0} max={100} placeholder="Score (0-100)" value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save Lead'}</Button>
        </div>
      )}
      {filtered.length === 0 ? <Empty msg="No leads yet" /> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr>{['Name','Company','Email','Status','Score'].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(lead => (
                <tr key={lead.id} className="bg-card hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-2 font-medium text-foreground">{lead.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{lead.company || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{lead.email || '—'}</td>
                  <td className="px-4 py-2"><Badge label={lead.status} cls={LEAD_BADGE[lead.status]} /></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${lead.score}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{lead.score}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Signals tab ──────────────────────────────────────────────────────────────

function SignalsTab({ signals }: { readonly signals: Signal[] }): React.JSX.Element {
  if (signals.length === 0) return <Empty msg="No signals yet" />
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {signals.map(s => (
        <div key={s.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Badge label={s.signal_type} cls="bg-blue-500/20 text-blue-400 border-blue-500/30" />
            <span className="text-xs text-muted-foreground shrink-0">{s.confidence}% confidence</span>
          </div>
          {s.company && <div className="text-sm font-medium text-foreground">{s.company}</div>}
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{s.description || '—'}</p>
          {s.source_url && <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">{s.source_url}</a>}
        </div>
      ))}
    </div>
  )
}

// ── Campaigns tab ────────────────────────────────────────────────────────────

function CampaignsTab({ campaigns, onRefresh }: {
  readonly campaigns: Campaign[]; readonly onRefresh: () => void
}): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'email' as CampaignType, budget: '0' })

  const handleCreate = async (): Promise<void> => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/marketing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_campaign', name: form.name, type: form.type, budget: Number(form.budget) }),
      })
      if (!res.ok) throw new Error('Failed to create campaign')
      setForm({ name: '', type: 'email', budget: '0' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create campaign failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New Campaign'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Campaign</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Campaign name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <select className={SELECT} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as CampaignType })}>
              {(['email','social','content','event'] as CampaignType[]).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className={INPUT} type="number" min={0} placeholder="Budget" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Create Campaign'}</Button>
        </div>
      )}
      {campaigns.length === 0 ? <Empty msg="No campaigns yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map(c => {
            const pct = c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0
            const barColor = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-primary'
            return (
              <div key={c.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  <Badge label={c.status} cls={CAMPAIGN_BADGE[c.status]} />
                </div>
                <Badge label={c.type} cls="bg-secondary text-muted-foreground border-border" />
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Budget: ${c.budget.toLocaleString()}</span><span>Spent: ${c.spent.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{c.leads_generated} leads</span><span>{c.conversion_rate.toFixed(1)}% CVR</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
