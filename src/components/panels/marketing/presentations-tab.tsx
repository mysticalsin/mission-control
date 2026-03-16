'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import type { MarketingPresentation } from './marketing-types'
import { formatUnixDate } from './marketing-types'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('MarketingPresentations')

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PresentationsTabProps {
  readonly onRefresh?: () => void
}

export function PresentationsTab({ onRefresh }: PresentationsTabProps): React.JSX.Element {
  const [presentations, setPresentations] = useState<readonly MarketingPresentation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const loadPresentations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/marketing?tab=presentations')
      if (!res.ok) throw new Error('Failed to load presentations')
      const data = await res.json()
      setPresentations(data.presentations ?? [])
      log.debug(`Loaded ${(data.presentations ?? []).length} presentations`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load presentations'
      log.error('Failed to load presentations:', err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPresentations() }, [loadPresentations])

  const handleRefresh = useCallback(async () => {
    await loadPresentations()
    onRefresh?.()
  }, [loadPresentations, onRefresh])

  const handleCreate = useCallback(async (title: string, topic: string, slideCount: number) => {
    try {
      const res = await fetch('/api/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_presentation',
          title,
          topic,
          slide_count: slideCount,
        }),
      })
      if (!res.ok) throw new Error('Failed to create presentation')
      log.debug('Presentation created successfully')
      setShowCreate(false)
      await loadPresentations()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create presentation'
      log.error('Failed to create presentation:', err)
      setError(message)
    }
  }, [loadPresentations])

  if (loading) {
    return <Loader variant="panel" label="Loading presentations" />
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        {error}
        <Button onClick={handleRefresh} variant="outline" size="sm" className="ml-3">Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {presentations.length} presentation{presentations.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>Refresh</Button>
          <Button size="sm" onClick={() => setShowCreate((prev) => !prev)}>
            {showCreate ? 'Cancel' : 'Generate Presentation'}
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && <CreatePresentationForm onCreate={handleCreate} />}

      {/* Presentation list */}
      {presentations.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <p className="text-lg mb-2">No presentations</p>
          <p className="text-sm">Generate AI-powered presentations to pitch to prospects.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {presentations.map((pres) => (
            <PresentationCard key={pres.id} presentation={pres} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Presentation card
// ---------------------------------------------------------------------------

const PRES_STATUS_COLORS: Record<string, string> = {
  generating: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  ready: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  archived: 'bg-secondary text-muted-foreground border-border',
}

function PresentationCard({ presentation }: { readonly presentation: MarketingPresentation }): React.JSX.Element {
  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-foreground line-clamp-2">{presentation.title}</h4>
        <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium ${PRES_STATUS_COLORS[presentation.status] ?? ''}`}>
          {presentation.status}
        </span>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{presentation.topic}</p>

      <div className="flex items-center justify-between text-2xs text-muted-foreground/70 border-t border-border/50 pt-2">
        <span>{presentation.slide_count} slides</span>
        <span>{formatUnixDate(presentation.created_at)}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create presentation form
// ---------------------------------------------------------------------------

function CreatePresentationForm({
  onCreate,
}: {
  readonly onCreate: (title: string, topic: string, slideCount: number) => Promise<void>
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [slideCount, setSlideCount] = useState('10')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (): Promise<void> => {
    if (!title.trim() || !topic.trim()) return
    setSubmitting(true)
    try {
      await onCreate(title.trim(), topic.trim(), Number(slideCount) || 10)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-medium text-foreground">Generate Presentation</h4>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Presentation title"
        className="h-9 w-full rounded-md border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Describe the topic and key points..."
        rows={3}
        className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
      />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Slides:</label>
          <input
            value={slideCount}
            onChange={(e) => setSlideCount(e.target.value)}
            type="number"
            min="1"
            max="100"
            className="h-9 w-20 rounded-md border border-border bg-secondary/50 px-3 text-sm text-foreground focus:outline-none"
          />
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !title.trim() || !topic.trim()}>
            {submitting ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </div>
    </div>
  )
}
