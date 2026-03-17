'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('DeepResearch')

// ── Types ────────────────────────────────────────────────────────────────────

interface ResearchJob {
  readonly id: string
  readonly query: string
  readonly status: 'queued' | 'researching' | 'writing' | 'completed' | 'error'
  readonly progress?: number
  readonly paper_url?: string
  readonly summary?: string
  readonly sections?: readonly ResearchSection[]
  readonly sources_count?: number
  readonly created_at: string
  readonly error?: string
}

interface ResearchSection {
  readonly title: string
  readonly content: string
  readonly sources: readonly string[]
}

type TabId = 'new' | 'papers'

// ── Component ────────────────────────────────────────────────────────────────

export function DeepResearchPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('new')

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Deep Research</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI-powered academic-grade research papers and analysis
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
        {(['new', 'papers'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'new' ? 'New Research' : 'My Papers'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'new' ? <NewResearchTab /> : <PapersTab />}
      </div>
    </div>
  )
}

// ── New Research Tab ──────────────────────────────────────────────────────────

function NewResearchTab(): React.ReactElement {
  const [query, setQuery] = useState('')
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('standard')
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState<ResearchJob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startResearch = useCallback(async (): Promise<void> => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setJob(null)

    try {
      const res = await fetch('/api/deep-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), depth }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data: ResearchJob = await res.json()
      setJob(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Research failed'
      log.error('Research failed', message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [query, depth])

  return (
    <div className="flex flex-col gap-4">
      {/* Research query */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">Research Topic</label>
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Enter your research topic or question... (e.g., 'Impact of transformer architectures on protein folding prediction accuracy')"
          rows={4}
          className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none"
        />
      </div>

      {/* Depth selector */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">Research Depth</label>
        <div className="flex gap-2">
          {(['quick', 'standard', 'deep'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDepth(d)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                depth === d
                  ? 'border-primary bg-primary/5 text-foreground font-medium'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="font-medium capitalize">{d}</div>
              <div className="text-xs mt-0.5 opacity-70">
                {d === 'quick' && '~5 sources, 2 min'}
                {d === 'standard' && '~15 sources, 5 min'}
                {d === 'deep' && '~30+ sources, 15 min'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Start button */}
      <Button
        variant="default"
        onClick={startResearch}
        disabled={loading || !query.trim()}
      >
        {loading ? (
          <><Loader variant="inline" /> Researching...</>
        ) : (
          'Start Research'
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Active job */}
      {job && <ResearchJobCard job={job} />}
    </div>
  )
}

// ── Papers Tab ───────────────────────────────────────────────────────────────

function PapersTab(): React.ReactElement {
  const [papers, setPapers] = useState<readonly ResearchJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchPapers = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/deep-research?action=list')
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setPapers(data.papers ?? data ?? [])
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load papers')
    } finally {
      setLoading(false)
    }
  }, [])

  if (!loaded && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-muted-foreground">Load your research papers from Jarvis</p>
        <Button variant="outline" size="sm" onClick={fetchPapers}>Load Papers</Button>
      </div>
    )
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader variant="inline" label="Loading papers..." /></div>
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchPapers}>Retry</Button>
      </div>
    )
  }

  if (papers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        No research papers yet. Start your first deep research above.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {papers.map(paper => (
        <div key={paper.id}>
          <button
            onClick={() => setExpandedId(expandedId === paper.id ? null : paper.id)}
            className="w-full text-left rounded-md border border-border bg-secondary/30 p-3 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground truncate max-w-lg">{paper.query}</span>
              <StatusBadge status={paper.status} />
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{paper.created_at}</span>
              {paper.sources_count !== undefined && <span>{paper.sources_count} sources</span>}
            </div>
          </button>
          {expandedId === paper.id && paper.sections && (
            <div className="mt-1 ml-3 border-l-2 border-border pl-3 py-2 space-y-3">
              {paper.sections.map((section, i) => (
                <div key={i}>
                  <h5 className="text-sm font-medium text-foreground">{section.title}</h5>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────────

function ResearchJobCard({ job }: { readonly job: ResearchJob }): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground truncate max-w-lg">{job.query}</span>
        <StatusBadge status={job.status} />
      </div>

      {job.progress !== undefined && (
        <div className="w-full bg-secondary rounded-full h-1.5 mb-3">
          <div
            className="bg-primary h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min(100, job.progress)}%` }}
          />
        </div>
      )}

      {job.summary && <p className="text-sm text-muted-foreground mb-2">{job.summary}</p>}

      {job.paper_url && (
        <a
          href={job.paper_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-400 hover:underline"
        >
          View Full Paper
        </a>
      )}

      {job.error && <p className="text-sm text-red-400">{job.error}</p>}
    </div>
  )
}

function StatusBadge({ status }: { readonly status: ResearchJob['status'] }): React.ReactElement {
  const styles: Record<string, string> = {
    queued: 'bg-zinc-500/10 text-zinc-400',
    researching: 'bg-blue-500/10 text-blue-400',
    writing: 'bg-yellow-500/10 text-yellow-400',
    completed: 'bg-green-500/10 text-green-400',
    error: 'bg-red-500/10 text-red-400',
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] ?? styles.queued}`}>
      {status}
    </span>
  )
}
