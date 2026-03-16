'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { useMissionControl } from '@/store'
import { createClientLogger } from '@/lib/client-logger'
import { OverviewTab } from './analytics/overview-tab'
import { AgentsTab } from './analytics/agents-tab'
import { TasksTab } from './analytics/tasks-tab'
import { CostsTab } from './analytics/costs-tab'
import { PerformanceTab } from './analytics/performance-tab'
import { UsageTab } from './analytics/usage-tab'
import type {
  AnalyticsTab, AnalyticsPeriod, AnalyticsResponse,
  OverviewData, AgentsData, TasksData,
  CostsData, PerformanceData, UsageData,
} from './analytics/types'

const log = createClientLogger('Analytics')

const TABS: readonly AnalyticsTab[] = [
  'overview', 'agents', 'tasks', 'costs', 'performance', 'usage',
] as const

const PERIODS: readonly AnalyticsPeriod[] = ['24h', '7d', '30d', '90d'] as const

const TAB_LABELS: Record<AnalyticsTab, string> = {
  overview: 'Overview',
  agents: 'Agents',
  tasks: 'Tasks',
  costs: 'Costs',
  performance: 'Performance',
  usage: 'Usage',
}

// Union of all tab data types
type TabData =
  | OverviewData
  | AgentsData
  | TasksData
  | CostsData
  | PerformanceData
  | UsageData

// -- Main Component --

export function AnalyticsPanel(): React.JSX.Element {
  useMissionControl()

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview')
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tabData, setTabData] = useState<TabData | null>(null)

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/analytics?tab=${activeTab}&period=${period}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json: AnalyticsResponse<TabData> = await res.json()
      setTabData(json.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load analytics'
      setError(message)
      log.error('Failed to load analytics:', err)
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, period])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    refreshTimer.current = setInterval(loadData, 60_000)
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [loadData])

  return (
    <div className="p-6 space-y-6">
      <AnalyticsHeader
        activeTab={activeTab}
        period={period}
        onTabChange={setActiveTab}
        onPeriodChange={setPeriod}
      />

      {isLoading && !tabData ? (
        <Loader variant="panel" label="Loading analytics data" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : !tabData ? (
        <EmptyState onRefresh={loadData} />
      ) : (
        <TabContent tab={activeTab} data={tabData} />
      )}
    </div>
  )
}

// -- Header with tabs and period selector --

interface HeaderProps {
  readonly activeTab: AnalyticsTab
  readonly period: AnalyticsPeriod
  readonly onTabChange: (tab: AnalyticsTab) => void
  readonly onPeriodChange: (period: AnalyticsPeriod) => void
}

function AnalyticsHeader({
  activeTab, period, onTabChange, onPeriodChange,
}: HeaderProps): React.JSX.Element {
  return (
    <div className="border-b border-border pb-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            System-wide analytics across agents, tasks, costs, and performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab selector */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          {/* Period selector */}
          <div className="flex space-x-1">
            {PERIODS.map((p) => (
              <Button
                key={p}
                onClick={() => onPeriodChange(p)}
                variant={period === p ? 'default' : 'secondary'}
                size="sm"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// -- Tab content router --

interface TabContentProps {
  readonly tab: AnalyticsTab
  readonly data: TabData
}

function TabContent({ tab, data }: TabContentProps): React.JSX.Element {
  switch (tab) {
    case 'overview':
      return <OverviewTab data={data as OverviewData} />
    case 'agents':
      return <AgentsTab data={data as AgentsData} />
    case 'tasks':
      return <TasksTab data={data as TasksData} />
    case 'costs':
      return <CostsTab data={data as CostsData} />
    case 'performance':
      return <PerformanceTab data={data as PerformanceData} />
    case 'usage':
      return <UsageTab data={data as UsageData} />
  }
}

// -- Error and empty states --

function ErrorState({
  message, onRetry,
}: { readonly message: string; readonly onRetry: () => void }): React.JSX.Element {
  return (
    <div className="text-center py-12">
      <div className="text-lg text-red-500 mb-2">Failed to load analytics</div>
      <div className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
        {message}
      </div>
      <Button onClick={onRetry} variant="outline" size="sm">Retry</Button>
    </div>
  )
}

function EmptyState({
  onRefresh,
}: { readonly onRefresh: () => void }): React.JSX.Element {
  return (
    <div className="text-center text-muted-foreground py-12">
      <div className="text-lg mb-2">No analytics data yet</div>
      <div className="text-sm max-w-sm mx-auto">
        Analytics data appears as agents run sessions, complete tasks, and consume tokens.
      </div>
      <Button onClick={onRefresh} variant="outline" size="sm" className="mt-4">
        Refresh
      </Button>
    </div>
  )
}
