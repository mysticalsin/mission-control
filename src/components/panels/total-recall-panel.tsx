'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import {
  FactsTab,
  AddFactTab,
  SearchTab,
  DecayTab,
  type RecallEntry,
  type RecallResponse,
} from './total-recall-tabs'

const log = createClientLogger('TotalRecall')

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'facts' | 'add' | 'search' | 'decay'

const TABS: readonly { readonly key: Tab; readonly label: string }[] = [
  { key: 'facts', label: 'Facts Database' },
  { key: 'add', label: 'Add Fact' },
  { key: 'search', label: 'Search' },
  { key: 'decay', label: 'Decay Monitor' },
]

// ── Main Panel ───────────────────────────────────────────────────────────────

export function TotalRecallPanel(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('facts')
  const [entries, setEntries] = useState<readonly RecallEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRecent = useCallback(async (hours = 720, limit = 100): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/total-recall?hours=${hours}&limit=${limit}`)
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = (await res.json()) as RecallResponse
      setEntries(data.results ?? [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load memories'
      log.error(msg)
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'facts' || tab === 'decay') {
      void fetchRecent()
    }
  }, [tab, fetchRecent])

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Header />
      <TabBar activeTab={tab} onTabChange={setTab} />

      {error && <ErrorBanner message={error} onRetry={() => void fetchRecent()} />}

      {tab === 'facts' && (
        <FactsTab entries={entries} isLoading={isLoading} />
      )}
      {tab === 'add' && (
        <AddFactTab onAdded={() => { setTab('facts'); void fetchRecent() }} />
      )}
      {tab === 'search' && <SearchTab />}
      {tab === 'decay' && (
        <DecayTab entries={entries} isLoading={isLoading} />
      )}
    </div>
  )
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header(): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Total Recall</h2>
        <p className="text-xs text-zinc-500">
          Persistent fact store and memory system
        </p>
      </div>
      <span className="rounded-full bg-purple-900/40 px-2 py-0.5 text-[10px] font-medium text-purple-300">
        JARVIS
      </span>
    </div>
  )
}

// ── Tab Bar ──────────────────────────────────────────────────────────────────

function TabBar({
  activeTab,
  onTabChange,
}: {
  readonly activeTab: Tab
  readonly onTabChange: (t: Tab) => void
}): React.ReactElement {
  return (
    <div className="flex gap-1 rounded-lg bg-zinc-900/60 p-1">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onTabChange(key)}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === key
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Error Banner ─────────────────────────────────────────────────────────────

function ErrorBanner({
  message,
  onRetry,
}: {
  readonly message: string
  readonly onRetry: () => void
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-lg bg-red-950/40 px-3 py-2 text-xs text-red-300">
      <span>{message}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}
