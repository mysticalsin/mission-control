'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { RemindersTab } from './life-manager/reminders-tab'
import { DigestTab } from './life-manager/digest-tab'
import { HabitsTab } from './life-manager/habits-tab'
import { NotesTab } from './life-manager/notes-tab'
import { PRIORITY_CLASSES } from './life-manager/types'
import type {
  LifeTab, Reminder, Digest, Habit, HabitLogEntry, Note,
} from './life-manager/types'

const log = createClientLogger('LifeManager')

// ── API response types ──────────────────────────────────────────────────

interface RemindersData {
  readonly reminders: readonly Reminder[]
}

interface DigestData {
  readonly digests: readonly Digest[]
}

interface HabitsData {
  readonly habits: readonly Habit[]
  readonly logs: Record<number, readonly HabitLogEntry[]>
}

interface NotesData {
  readonly notes: readonly Note[]
}

type TabData = RemindersData | DigestData | HabitsData | NotesData

// ── Data fetcher ────────────────────────────────────────────────────────

async function fetchTabData(tab: LifeTab): Promise<TabData> {
  const response = await fetch(`/api/life-manager?tab=${tab}`)
  if (!response.ok) {
    throw new Error(`Failed to load ${tab}: ${response.status}`)
  }
  return response.json() as Promise<TabData>
}

async function sendAction(
  method: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch('/api/life-manager', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(errorData.error ?? `Request failed: ${response.status}`)
  }
}

// ── Tab Configuration ───────────────────────────────────────────────────

const TAB_CONFIG: readonly { readonly key: LifeTab; readonly label: string }[] = [
  { key: 'reminders', label: 'Reminders' },
  { key: 'digest', label: 'Digest' },
  { key: 'habits', label: 'Habits' },
  { key: 'notes', label: 'Notes' },
] as const

// ── Main Component ──────────────────────────────────────────────────────

export function LifeManagerPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<LifeTab>('reminders')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tab-specific state
  const [reminders, setReminders] = useState<readonly Reminder[]>([])
  const [digests, setDigests] = useState<readonly Digest[]>([])
  const [habits, setHabits] = useState<readonly Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<Record<number, readonly HabitLogEntry[]>>({})
  const [notes, setNotes] = useState<readonly Note[]>([])

  const loadTab = useCallback(async (tab: LifeTab): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchTabData(tab)
      applyTabData(tab, data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data'
      setError(message)
      log.error(`Failed to load ${tab} data:`, err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  function applyTabData(tab: LifeTab, data: TabData): void {
    switch (tab) {
      case 'reminders':
        setReminders((data as RemindersData).reminders ?? [])
        break
      case 'digest':
        setDigests((data as DigestData).digests ?? [])
        break
      case 'habits':
        setHabits((data as HabitsData).habits ?? [])
        setHabitLogs((data as HabitsData).logs ?? {})
        break
      case 'notes':
        setNotes((data as NotesData).notes ?? [])
        break
    }
  }

  useEffect(() => { loadTab(activeTab) }, [activeTab, loadTab])

  // Reload current tab after a mutation
  const handleAction = useCallback(
    async (method: string, body: Record<string, unknown>): Promise<void> => {
      try {
        await sendAction(method, body)
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
            <h1 className="text-3xl font-bold text-foreground">Life Manager</h1>
            <p className="text-muted-foreground mt-1">
              Personal assistant: reminders, daily digests, habits, and notes
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

      {/* Content */}
      {isLoading ? (
        <Loader variant="panel" label={`Loading ${activeTab}`} />
      ) : (
        <TabContent
          tab={activeTab}
          reminders={reminders}
          digests={digests}
          habits={habits}
          habitLogs={habitLogs}
          notes={notes}
          onAction={handleAction}
        />
      )}
    </div>
  )
}

// ── Tab Router ──────────────────────────────────────────────────────────

function TabContent({
  tab, reminders, digests, habits, habitLogs, notes, onAction,
}: {
  readonly tab: LifeTab
  readonly reminders: readonly Reminder[]
  readonly digests: readonly Digest[]
  readonly habits: readonly Habit[]
  readonly habitLogs: Record<number, readonly HabitLogEntry[]>
  readonly notes: readonly Note[]
  readonly onAction: (method: string, body: Record<string, unknown>) => Promise<void>
}): React.ReactElement {
  switch (tab) {
    case 'reminders':
      return <RemindersTab reminders={reminders} priorityClasses={PRIORITY_CLASSES} onAction={onAction} />
    case 'digest':
      return <DigestTab digests={digests} onAction={onAction} />
    case 'habits':
      return <HabitsTab habits={habits} habitLogs={habitLogs} onAction={onAction} />
    case 'notes':
      return <NotesTab notes={notes} onAction={onAction} />
  }
}
