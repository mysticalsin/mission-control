'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { UpcomingTab } from './meetings/upcoming-tab'
import { PastTab } from './meetings/past-tab'
import { ActionsTab } from './meetings/actions-tab'
import type { Meeting, ActionItem } from './meetings/types'

const log = createClientLogger('Meetings')

type Tab = 'upcoming' | 'past' | 'actions'

// ── Main Component ──────────────────────────────────

export function MeetingsPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      if (tab === 'actions') {
        const res = await fetch('/api/meetings?tab=actions')
        if (!res.ok) throw new Error('Failed to load action items')
        const data = await res.json()
        setActions(data.actions ?? [])
      } else {
        const res = await fetch(`/api/meetings?tab=${tab}`)
        if (!res.ok) throw new Error(`Failed to load ${tab} meetings`)
        const data = await res.json()
        setMeetings(data.meetings ?? [])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Failed to load meetings data:', err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [tab])

  useEffect(() => { loadData() }, [loadData])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Meetings</h1>
            <p className="text-muted-foreground mt-1">
              Schedule, review, and track action items from meetings
            </p>
          </div>
          <div className="flex items-center gap-3">
            <TabBar activeTab={tab} onTabChange={setTab} />
            <Button onClick={loadData} variant="outline" size="sm">
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : isLoading ? (
        <Loader variant="panel" label={`Loading ${tab} data`} />
      ) : tab === 'upcoming' ? (
        <UpcomingTab meetings={meetings} onRefresh={loadData} />
      ) : tab === 'past' ? (
        <PastTab meetings={meetings} onRefresh={loadData} />
      ) : (
        <ActionsTab actions={actions} onRefresh={loadData} />
      )}
    </div>
  )
}

// ── Tab Bar ─────────────────────────────────────────

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}): React.JSX.Element {
  const tabs: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'actions', label: 'Action Items' },
  ]

  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onTabChange(key)}
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
  )
}

// ── Error State ─────────────────────────────────────

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="text-center py-12">
      <div className="text-lg text-red-400 mb-2">Failed to load data</div>
      <div className="text-sm text-muted-foreground mb-4">{message}</div>
      <Button onClick={onRetry} variant="outline" size="sm">
        Retry
      </Button>
    </div>
  )
}
