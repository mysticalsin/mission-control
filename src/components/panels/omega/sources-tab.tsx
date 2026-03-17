'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { StatCard, ErrorState, EmptyState } from './shared'
import type { TabProps, ReplayStats } from './types'

const log = createClientLogger('Omega:Sources')

export function SourcesTab({ isLoading, setIsLoading, error, setError }: TabProps): React.JSX.Element {
  const [replayStats, setReplayStats] = useState<ReplayStats | null>(null)

  const loadSources = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/omega?tab=replay')
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(body.error ?? `Replay stats request failed (${res.status})`)
      }
      const data = await res.json() as ReplayStats
      setReplayStats(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sources'
      setError(message)
      log.error('Sources load failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [setIsLoading, setError])

  useEffect(() => { void loadSources() }, [loadSources])

  if (isLoading) return <Loader label="Loading data sources..." />
  if (error) return <ErrorState message={error} onRetry={loadSources} />
  if (!replayStats) return <EmptyState message="No replay data available" />

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Entries" value={replayStats.total_entries.toLocaleString()} />
        <StatCard
          label="Cache Hit Rate"
          value={`${(replayStats.cache_hit_rate * 100).toFixed(1)}%`}
          accent={replayStats.cache_hit_rate > 0.5 ? 'text-green-400' : 'text-yellow-400'}
        />
        <StatCard label="Avg Latency" value={`${replayStats.avg_latency_ms.toFixed(0)}ms`} />
        <StatCard label="Storage" value={`${replayStats.storage_estimate_mb.toFixed(2)} MB`} />
      </div>

      {/* Top agents by LLM calls */}
      <AgentList title="Top Agents (LLM Calls)" items={replayStats.top_agents} />

      {/* Top models */}
      <AgentList title="Top Models" items={replayStats.top_models} />

      <Button variant="outline" size="sm" onClick={loadSources} className="self-end">
        Refresh
      </Button>
    </div>
  )
}

// Helper to render a ranked list of agent/model entries
function AgentList({
  title,
  items,
}: {
  readonly title: string
  readonly items: Readonly<Record<string, number>>
}): React.JSX.Element | null {
  const entries = Object.entries(items)
  if (entries.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-medium text-foreground mb-2">{title}</h3>
      <div className="space-y-1">
        {entries.map(([key, count]) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <span className="font-mono text-muted-foreground">{key}</span>
            <span className="text-primary">{count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
