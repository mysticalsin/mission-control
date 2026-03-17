'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { StatCard, ErrorState, EmptyState } from './shared'
import type { TabProps, OmegaStatus, DecisionStats } from './types'

const log = createClientLogger('Omega:Dashboard')

export function DashboardTab({ isLoading, setIsLoading, error, setError }: TabProps): React.JSX.Element {
  const [status, setStatus] = useState<OmegaStatus | null>(null)
  const [decisionStats, setDecisionStats] = useState<DecisionStats | null>(null)

  const loadDashboard = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const [statusRes, statsRes] = await Promise.all([
        fetch('/api/omega?tab=status'),
        fetch('/api/omega?tab=reports'),
      ])

      if (!statusRes.ok) {
        const body = await statusRes.json().catch(() => ({})) as Record<string, string>
        throw new Error(body.error ?? `Status request failed (${statusRes.status})`)
      }
      if (!statsRes.ok) {
        const body = await statsRes.json().catch(() => ({})) as Record<string, string>
        throw new Error(body.error ?? `Stats request failed (${statsRes.status})`)
      }

      const statusData = await statusRes.json() as OmegaStatus
      const statsData = await statsRes.json() as DecisionStats
      setStatus(statusData)
      setDecisionStats(statsData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard'
      setError(message)
      log.error('Dashboard load failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [setIsLoading, setError])

  useEffect(() => { void loadDashboard() }, [loadDashboard])

  if (isLoading) return <Loader label="Loading Omega status..." />
  if (error) return <ErrorState message={error} onRetry={loadDashboard} />
  if (!status && !decisionStats) return <EmptyState message="No Omega data available" />

  return (
    <div className="flex flex-col gap-4">
      {/* System status cards */}
      {status && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="System Status"
            value={status.status}
            accent={status.status === 'operational' ? 'text-green-400' : 'text-yellow-400'}
          />
          <StatCard
            label="Permission Coverage"
            value={`${(status.permission_coverage * 100).toFixed(1)}%`}
          />
          <StatCard
            label="Cache Size"
            value={`${(status.cache_size_bytes / 1024).toFixed(1)} KB`}
          />
          <StatCard
            label="Tables"
            value={Object.values(status.tables).reduce((a, b) => a + b, 0).toLocaleString()}
          />
        </div>
      )}

      {/* Decision stats cards */}
      {decisionStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Decisions" value={decisionStats.total_decisions.toLocaleString()} />
          <StatCard
            label="Success Rate"
            value={`${(decisionStats.success_rate * 100).toFixed(1)}%`}
            accent={decisionStats.success_rate > 0.9 ? 'text-green-400' : 'text-yellow-400'}
          />
          <StatCard label="Avg Duration" value={`${decisionStats.avg_duration_ms.toFixed(0)}ms`} />
          <StatCard label="Tokens Used" value={decisionStats.total_tokens_used.toLocaleString()} />
        </div>
      )}

      {/* Chain integrity samples */}
      {status?.chain_samples && status.chain_samples.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <h3 className="text-sm font-medium text-foreground mb-2">Chain Integrity</h3>
          <div className="space-y-1">
            {status.chain_samples.map((sample) => (
              <div key={sample.agent_id} className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground">{sample.agent_id}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{sample.total_decisions} decisions</span>
                  <span className={sample.genesis_correct ? 'text-green-400' : 'text-red-400'}>
                    {sample.genesis_correct ? 'VALID' : 'BROKEN'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={loadDashboard} className="self-end">
        Refresh
      </Button>
    </div>
  )
}
