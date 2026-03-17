'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { CalendarViewTab } from './calendar/calendar-view-tab'
import { SyncStatusTab } from './calendar/sync-status-tab'
import { AccountsTab } from './calendar/accounts-tab'
import type {
  CalendarTab,
  CalendarEvent,
  CalendarConnection,
  SyncResult,
} from './calendar/types'

const log = createClientLogger('Calendar')

// ── Shared UI ────────────────────────────────────────

function TabBar({
  activeTab,
  onTabChange,
}: {
  readonly activeTab: CalendarTab
  readonly onTabChange: (tab: CalendarTab) => void
}): React.JSX.Element {
  const tabs: readonly { readonly key: CalendarTab; readonly label: string }[] =
    [
      { key: 'calendar', label: 'Calendar View' },
      { key: 'sync', label: 'Sync Status' },
      { key: 'accounts', label: 'Connected Accounts' },
    ]

  return (
    <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onTabChange(t.key)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === t.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string
  readonly onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-red-400 text-4xl mb-4">!</div>
      <p className="text-red-400 font-medium mb-2">Something went wrong</p>
      <p className="text-muted-foreground text-sm mb-4">{message}</p>
      <Button onClick={onRetry} variant="outline" size="sm">
        Retry
      </Button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────

export function CalendarPanel(): React.JSX.Element {
  const [tab, setTab] = useState<CalendarTab>('calendar')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [connections, setConnections] = useState<CalendarConnection[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      if (tab === 'calendar') {
        const res = await fetch('/api/calendar')
        if (!res.ok) throw new Error('Failed to load calendar events')
        const data = await res.json()
        setEvents(data.events ?? [])
      } else {
        const res = await fetch('/api/calendar/connections')
        if (!res.ok) throw new Error('Failed to load connections')
        const data = await res.json()
        setConnections(data.connections ?? data ?? [])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Failed to load calendar data:', err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [tab])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSync = useCallback(
    async (connId: string, provider: string): Promise<void> => {
      setIsSyncing(true)
      setSyncResult(null)
      try {
        const res = await fetch(`/api/calendar/sync-${provider}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: connId }),
        })
        if (!res.ok) throw new Error(`Sync failed: ${res.statusText}`)
        const data = await res.json()
        setSyncResult(data)
        log.info(`Synced ${data.events_synced} events from ${provider}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed'
        log.error('Calendar sync error:', err)
        setError(message)
      } finally {
        setIsSyncing(false)
      }
    },
    [],
  )

  const handleDelete = useCallback(
    async (connId: string): Promise<void> => {
      setIsDeleting(true)
      try {
        const res = await fetch('/api/calendar/delete-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: connId }),
        })
        if (!res.ok) throw new Error('Failed to disconnect account')
        // Immutable filter — returns new array
        setConnections((prev) => prev.filter((c) => c.id !== connId))
        log.info(`Disconnected calendar connection: ${connId}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete failed'
        log.error('Failed to delete connection:', err)
        setError(message)
      } finally {
        setIsDeleting(false)
      }
    },
    [],
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Calendar Sync
            </h1>
            <p className="text-muted-foreground mt-1">
              Unified calendar view across Google, Apple, tasks, and cron jobs
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

      {/* Content — loading, error, and empty states handled per-tab */}
      {error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : isLoading ? (
        <Loader variant="panel" label={`Loading ${tab} data`} />
      ) : tab === 'calendar' ? (
        <CalendarViewTab events={events} onRefresh={loadData} />
      ) : tab === 'sync' ? (
        <SyncStatusTab
          connections={connections}
          onSync={handleSync}
          isSyncing={isSyncing}
          syncResult={syncResult}
        />
      ) : (
        <AccountsTab
          connections={connections}
          onDelete={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  )
}
