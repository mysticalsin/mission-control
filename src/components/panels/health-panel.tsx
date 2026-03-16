'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { DashboardTab, MetricsTab, GoalsTab } from './health-panel-tabs'
import type { DashboardData, MetricRow, GoalRow } from './health-panel-tabs'

const log = createClientLogger('HealthPanel')

// ── Types ──────────────────────────────────────────────────────────────────

type HealthTab = 'dashboard' | 'metrics' | 'goals'

const TAB_CONFIG: readonly { key: HealthTab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'goals', label: 'Goals' },
]

// ── API helpers ────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function apiMutate(method: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/health-tracker', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`)
  }
}

// ── Main Panel ─────────────────────────────────────────────────────────────

export function HealthPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<HealthTab>('dashboard')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [metrics, setMetrics] = useState<MetricRow[]>([])
  const [goals, setGoals] = useState<GoalRow[]>([])

  const loadDashboard = useCallback(async (): Promise<void> => {
    const data = await apiFetch<DashboardData>('/api/health-tracker?tab=dashboard')
    setDashboard(data)
  }, [])

  const loadTab = useCallback(async (tab: HealthTab): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      if (tab === 'dashboard') {
        await loadDashboard()
      } else if (tab === 'metrics') {
        const [metricData] = await Promise.all([
          apiFetch<{ metrics: MetricRow[] }>('/api/health-tracker?tab=metrics'),
          dashboard ? Promise.resolve() : loadDashboard(),
        ])
        setMetrics(metricData.metrics)
      } else if (tab === 'goals') {
        const data = await apiFetch<{ goals: GoalRow[] }>('/api/health-tracker?tab=goals')
        setGoals(data.goals)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data'
      setError(message)
      log.error(`Failed to load ${tab}:`, err)
    } finally {
      setIsLoading(false)
    }
  }, [dashboard, loadDashboard])

  // Load on tab change — intentionally omit loadTab from deps to avoid re-triggering on state updates
  useEffect(() => { loadTab(activeTab) }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = useCallback(
    async (method: string, body: Record<string, unknown>): Promise<void> => {
      try {
        await apiMutate(method, body)
        await loadTab(activeTab)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action failed'
        setError(message)
        log.error('Action failed:', err)
      }
    },
    [activeTab, loadTab],
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Health Tracker</h1>
            <p className="text-muted-foreground mt-1">
              Monitor vitals, log metrics, and track wellness goals
            </p>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {TAB_CONFIG.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* Tab content */}
      {isLoading ? (
        <Loader variant="panel" label={`Loading ${activeTab}`} />
      ) : (
        <>
          {activeTab === 'dashboard' && dashboard && (
            <DashboardTab data={dashboard} />
          )}
          {activeTab === 'metrics' && (
            <MetricsTab
              metrics={metrics}
              onAction={handleAction}
              defaultUnits={dashboard?.defaultUnits ?? {} as Record<import('./health-panel-tabs').MetricType, string>}
            />
          )}
          {activeTab === 'goals' && (
            <GoalsTab goals={goals} onAction={handleAction} />
          )}
        </>
      )}
    </div>
  )
}
