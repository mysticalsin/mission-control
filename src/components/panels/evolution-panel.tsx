'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('EvolutionPanel')

// ── Types ──────────────────────────────────────────────────────────────────

type EvolutionTab = 'timeline' | 'capabilities' | 'growth'

const TAB_CONFIG: readonly { readonly key: EvolutionTab; readonly label: string }[] = [
  { key: 'timeline', label: 'Evolution Timeline' },
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'growth', label: 'Growth Metrics' },
]

interface TimelineEvent {
  readonly id: string
  readonly type: string
  readonly description: string
  readonly agent_id: string
  readonly timestamp: string
  readonly metadata: Record<string, unknown>
}

interface Capability {
  readonly key: string
  readonly label: string
  readonly enabled: boolean
  readonly description: string
  readonly updated_at: string
}

interface GrowthMetric {
  readonly metric: string
  readonly current: number
  readonly previous: number
  readonly delta: number
  readonly unit: string
}

interface TimelineData {
  readonly events: readonly TimelineEvent[]
  readonly total: number
}

interface CapabilitiesData {
  readonly flags: readonly Capability[]
}

interface GrowthData {
  readonly metrics: readonly GrowthMetric[]
  readonly period: string
}

interface AssessmentResult {
  readonly status: string
  readonly summary: string
  readonly timestamp: string
}

// ── API Helpers ────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
    )
  }
  return res.json() as Promise<T>
}

async function apiPost<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(
      (err as { error?: string }).error ?? `Request failed: ${res.status}`,
    )
  }
  return res.json() as Promise<T>
}

// ── Sub-Components ─────────────────────────────────────────────────────────

function TimelineTab({ data }: { readonly data: TimelineData }): React.ReactElement {
  if (data.events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <p className="text-lg">No evolution events recorded yet</p>
        <p className="text-sm mt-1">
          System evolution history will appear here as changes occur.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        {data.total} event{data.total !== 1 ? 's' : ''} recorded
      </p>
      <div className="space-y-2">
        {data.events.map((event) => (
          <div
            key={event.id}
            className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-200">
                {event.description}
              </span>
              <span className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                {event.type}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
              <span>Agent: {event.agent_id}</span>
              <span>{new Date(event.timestamp).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CapabilitiesTab({ data }: { readonly data: CapabilitiesData }): React.ReactElement {
  if (data.flags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <p className="text-lg">No capabilities tracked yet</p>
        <p className="text-sm mt-1">
          Feature flags and capability progression will appear here.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {data.flags.map((cap) => (
        <div
          key={cap.key}
          className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-3"
        >
          <div>
            <span className="text-sm font-medium text-zinc-200">{cap.label}</span>
            <p className="text-xs text-zinc-500 mt-0.5">{cap.description}</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              cap.enabled
                ? 'bg-emerald-900/50 text-emerald-400'
                : 'bg-zinc-700 text-zinc-400'
            }`}
          >
            {cap.enabled ? 'Active' : 'Inactive'}
          </span>
        </div>
      ))}
    </div>
  )
}

function GrowthTab({ data }: { readonly data: GrowthData }): React.ReactElement {
  if (data.metrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <p className="text-lg">No growth metrics available</p>
        <p className="text-sm mt-1">
          Performance growth data will populate as the system evolves.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-400">Period: {data.period}</p>
      {data.metrics.map((m) => {
        const isPositive = m.delta > 0
        const isNeutral = m.delta === 0
        return (
          <div
            key={m.metric}
            className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-3"
          >
            <span className="text-sm font-medium text-zinc-200">{m.metric}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-300">
                {m.current}{m.unit ? ` ${m.unit}` : ''}
              </span>
              <span
                className={`text-xs font-medium ${
                  isNeutral
                    ? 'text-zinc-400'
                    : isPositive
                      ? 'text-emerald-400'
                      : 'text-red-400'
                }`}
              >
                {isPositive ? '+' : ''}{m.delta}{m.unit ? ` ${m.unit}` : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────

export function EvolutionPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<EvolutionTab>('timeline')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assessing, setAssessing] = useState(false)
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null)
  const [capabilitiesData, setCapabilitiesData] = useState<CapabilitiesData | null>(null)
  const [growthData, setGrowthData] = useState<GrowthData | null>(null)

  const loadTabData = useCallback(async (tab: EvolutionTab): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      switch (tab) {
        case 'timeline': {
          const data = await apiFetch<TimelineData>('/api/evolution/timeline')
          setTimelineData(data)
          break
        }
        case 'capabilities': {
          const data = await apiFetch<CapabilitiesData>('/api/evolution/capabilities')
          setCapabilitiesData(data)
          break
        }
        case 'growth': {
          const data = await apiFetch<GrowthData>('/api/evolution/growth')
          setGrowthData(data)
          break
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load evolution data'
      setError(message)
      log.error(`Failed to load ${tab} data:`, err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTabData(activeTab)
  }, [activeTab, loadTabData])

  const handleAssess = useCallback(async (): Promise<void> => {
    setAssessing(true)
    setError(null)
    try {
      const result = await apiPost<AssessmentResult>('/api/evolution', {
        action: 'assess',
      })
      log.info('Assessment complete:', result.summary)
      await loadTabData(activeTab)
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Failed to trigger evolution assessment'
      setError(message)
      log.error('Assessment failed:', err)
    } finally {
      setAssessing(false)
    }
  }, [activeTab, loadTabData])

  const handleTabSwitch = useCallback((tab: EvolutionTab): void => {
    setActiveTab(tab)
  }, [])

  return (
    <div className="flex h-full flex-col bg-zinc-900 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
        <h2 className="text-lg font-semibold">System Evolution & Learning</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadTabData(activeTab)}
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => void handleAssess()}
            disabled={assessing || isLoading}
          >
            {assessing ? 'Assessing...' : 'Run Assessment'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-700 px-4">
        {TAB_CONFIG.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleTabSwitch(key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader />
          </div>
        )}
        {!isLoading && error && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-4">
            <p className="text-sm text-red-400">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void loadTabData(activeTab)}
            >
              Retry
            </Button>
          </div>
        )}
        {!isLoading && !error && activeTab === 'timeline' && timelineData && (
          <TimelineTab data={timelineData} />
        )}
        {!isLoading && !error && activeTab === 'capabilities' && capabilitiesData && (
          <CapabilitiesTab data={capabilitiesData} />
        )}
        {!isLoading && !error && activeTab === 'growth' && growthData && (
          <GrowthTab data={growthData} />
        )}
      </div>
    </div>
  )
}
