'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import type { MarketingSignal } from './marketing-types'
import { SIGNAL_TYPE_ICONS, formatUnixDate } from './marketing-types'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('MarketingSignals')

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SignalsTabProps {
  readonly onRefresh?: () => void
}

export function SignalsTab({ onRefresh }: SignalsTabProps): React.JSX.Element {
  const [signals, setSignals] = useState<readonly MarketingSignal[]>([])
  const [typeCounts, setTypeCounts] = useState<readonly { signal_type: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('')

  const loadSignals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.set('type', typeFilter)

      const res = await fetch(`/api/marketing/signals?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load signals')

      const data = await res.json()
      setSignals(data.signals ?? [])
      setTypeCounts(data.typeCounts ?? [])
      log.debug(`Loaded ${(data.signals ?? []).length} signals`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load signals'
      log.error('Failed to load signals:', err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  useEffect(() => { loadSignals() }, [loadSignals])

  const handleRefresh = useCallback(async () => {
    await loadSignals()
    onRefresh?.()
  }, [loadSignals, onRefresh])

  if (loading) {
    return <Loader variant="panel" label="Loading signals" />
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
      {/* Type filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={typeFilter === '' ? 'default' : 'secondary'}
          size="sm"
          onClick={() => setTypeFilter('')}
        >
          All
        </Button>
        {typeCounts.map((tc) => (
          <Button
            key={tc.signal_type}
            variant={typeFilter === tc.signal_type ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setTypeFilter(tc.signal_type)}
          >
            {tc.signal_type.replace('_', ' ')} ({tc.count})
          </Button>
        ))}
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleRefresh}>Refresh</Button>
        </div>
      </div>

      {/* Signal cards */}
      {signals.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <p className="text-lg mb-2">No signals detected</p>
          <p className="text-sm">Market signals will appear here as they are captured.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Signal card
// ---------------------------------------------------------------------------

function SignalCard({ signal }: { readonly signal: MarketingSignal }): React.JSX.Element {
  const typeColor = SIGNAL_TYPE_ICONS[signal.signal_type] ?? 'bg-secondary text-muted-foreground'

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`inline-block rounded-full px-2 py-0.5 text-2xs font-medium ${typeColor}`}>
          {signal.signal_type.replace('_', ' ')}
        </span>
        <ConfidenceBadge confidence={signal.confidence} />
      </div>

      <h4 className="text-sm font-medium text-foreground mb-1">{signal.company}</h4>
      <p className="text-xs text-muted-foreground line-clamp-3 mb-3">{signal.description}</p>

      <div className="flex items-center justify-between text-2xs text-muted-foreground/70">
        <span>{formatUnixDate(signal.created_at)}</span>
        {signal.source_url && (
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Source
          </a>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence }: { readonly confidence: number }): React.JSX.Element {
  const color =
    confidence >= 80 ? 'text-emerald-400' :
    confidence >= 50 ? 'text-amber-400' :
    'text-rose-400'

  return (
    <span className={`text-xs font-semibold ${color}`}>
      {confidence}%
    </span>
  )
}
