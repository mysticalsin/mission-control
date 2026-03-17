'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { StatusBadge, ErrorState, EmptyState } from './shared'
import type { TabProps, TimelineEntry } from './types'

const log = createClientLogger('Omega:Reports')

const TIME_WINDOWS = [30, 60, 360, 1440] as const

function formatWindowLabel(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${minutes / 60}h`
}

export function ReportsTab({ isLoading, setIsLoading, error, setError }: TabProps): React.JSX.Element {
  const [timeline, setTimeline] = useState<readonly TimelineEntry[]>([])
  const [minutes, setMinutes] = useState(60)

  const loadTimeline = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/omega?tab=timeline&minutes=${minutes}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(body.error ?? `Timeline request failed (${res.status})`)
      }
      const data = await res.json() as { timeline: TimelineEntry[] }
      setTimeline(data.timeline ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load timeline'
      setError(message)
      log.error('Timeline load failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [minutes, setIsLoading, setError])

  useEffect(() => { void loadTimeline() }, [loadTimeline])

  if (isLoading) return <Loader label="Loading intelligence reports..." />
  if (error) return <ErrorState message={error} onRetry={loadTimeline} />

  return (
    <div className="flex flex-col gap-3">
      {/* Time window selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Window:</span>
        {TIME_WINDOWS.map((m) => (
          <button
            key={m}
            onClick={() => setMinutes(m)}
            className={`px-2 py-0.5 text-xs rounded ${
              minutes === m ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {formatWindowLabel(m)}
          </button>
        ))}
      </div>

      {/* Timeline entries */}
      {timeline.length === 0 ? (
        <EmptyState message="No decisions in this time window" />
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-1">
          {timeline.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-primary">{entry.agent_id}</span>
                <span className="text-muted-foreground">{entry.decision_type}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={entry.status} />
                <span className="text-muted-foreground font-mono">
                  {new Date(entry.created_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
