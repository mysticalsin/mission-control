'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('TotalRecallTabs')

// ── Exported Types ───────────────────────────────────────────────────────────

export interface RecallEntry {
  readonly id?: number
  readonly user_message: string
  readonly assistant_response: string
  readonly source: string
  readonly conversation_id?: string
  readonly timestamp?: string
  readonly created_at?: string
  readonly similarity?: number
}

export interface RecallResponse {
  readonly success: boolean
  readonly results: readonly RecallEntry[]
  readonly count: number
}

interface LogPayload {
  readonly user_message: string
  readonly assistant_response: string
  readonly source: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

function confidenceBadge(score: number | undefined): string {
  if (score === undefined) return 'bg-zinc-700 text-zinc-300'
  if (score >= 0.8) return 'bg-emerald-900/60 text-emerald-300'
  if (score >= 0.5) return 'bg-amber-900/60 text-amber-300'
  return 'bg-red-900/60 text-red-300'
}

const INPUT_CLS = 'rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-200 placeholder-zinc-600 focus:border-purple-600 focus:outline-none'

// ── Fact Card (shared) ───────────────────────────────────────────────────────

function FactCard({ entry }: { readonly entry: RecallEntry }): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-zinc-500 uppercase">{entry.source}</span>
        <div className="flex items-center gap-2">
          {entry.similarity !== undefined && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${confidenceBadge(entry.similarity)}`}>
              {(entry.similarity * 100).toFixed(0)}%
            </span>
          )}
          <span className="text-[10px] text-zinc-600">{timeAgo(entry.timestamp ?? entry.created_at)}</span>
        </div>
      </div>
      <p className="text-xs font-medium text-zinc-200 line-clamp-2">{entry.user_message}</p>
      <p className="mt-1 text-xs text-zinc-400 line-clamp-3">{entry.assistant_response}</p>
      {entry.conversation_id && (
        <p className="mt-1 text-[10px] text-zinc-600 font-mono">conv: {entry.conversation_id}</p>
      )}
    </div>
  )
}

// ── Facts Tab ────────────────────────────────────────────────────────────────

export function FactsTab({ entries, isLoading }: {
  readonly entries: readonly RecallEntry[]
  readonly isLoading: boolean
}): React.ReactElement {
  if (isLoading) return <div className="flex flex-1 items-center justify-center"><Loader /></div>

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-500">
        <p className="text-sm">No memories stored yet</p>
        <p className="text-xs">Add facts or log conversations to build the memory store.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto">
      <p className="text-xs text-zinc-500">{entries.length} memories loaded</p>
      {entries.map((entry, idx) => <FactCard key={entry.id ?? idx} entry={entry} />)}
    </div>
  )
}

// ── Add Fact Tab ─────────────────────────────────────────────────────────────

export function AddFactTab({ onAdded }: { readonly onAdded: () => void }): React.ReactElement {
  const [form, setForm] = useState<LogPayload>({ user_message: '', assistant_response: '', source: 'manual' })
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSubmit = async (): Promise<void> => {
    if (!form.user_message.trim() || !form.assistant_response.trim()) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/total-recall/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)
      setForm({ user_message: '', assistant_response: '', source: 'manual' })
      onAdded()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save fact'
      log.error(msg)
      setSaveError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const canSubmit = form.user_message.trim() && form.assistant_response.trim()

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-400">Fact / Question</span>
        <textarea className={INPUT_CLS} rows={3} placeholder="What is the fact or question..."
          value={form.user_message} onChange={(e) => setForm({ ...form, user_message: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-400">Value / Answer</span>
        <textarea className={INPUT_CLS} rows={3} placeholder="The answer or value to store..."
          value={form.assistant_response} onChange={(e) => setForm({ ...form, assistant_response: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-400">Source</span>
        <select className={INPUT_CLS} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
          <option value="manual">Manual</option>
          <option value="agent">Agent</option>
          <option value="system">System</option>
          <option value="user">User</option>
        </select>
      </label>
      {saveError && <p className="text-xs text-red-400">{saveError}</p>}
      <Button onClick={() => void handleSubmit()} disabled={isSaving || !canSubmit} className="w-full">
        {isSaving ? 'Saving...' : 'Store Fact'}
      </Button>
    </div>
  )
}

// ── Search Tab ───────────────────────────────────────────────────────────────

export function SearchTab(): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly RecallEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = async (): Promise<void> => {
    if (!query.trim()) return
    setIsSearching(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/total-recall/search?query=${encodeURIComponent(query)}&limit=20`)
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      const data = (await res.json()) as RecallResponse
      setResults(data.results ?? [])
    } catch (err) {
      log.error(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input className={`flex-1 px-3 py-2 ${INPUT_CLS}`} placeholder="Search memories by topic..."
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }} />
        <Button onClick={() => void handleSearch()} disabled={isSearching || !query.trim()} size="sm">
          {isSearching ? 'Searching...' : 'Search'}
        </Button>
      </div>
      {isSearching && <div className="flex justify-center py-8"><Loader /></div>}
      {!isSearching && searched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-1 py-8 text-zinc-500">
          <p className="text-sm">No results found</p>
          <p className="text-xs">Try a different search term.</p>
        </div>
      )}
      {!isSearching && results.length > 0 && (
        <div className="flex flex-col gap-2 overflow-y-auto">
          <p className="text-xs text-zinc-500">{results.length} result{results.length !== 1 ? 's' : ''}</p>
          {results.map((entry, idx) => <FactCard key={entry.id ?? idx} entry={entry} />)}
        </div>
      )}
    </div>
  )
}

// ── Decay Monitor Tab ────────────────────────────────────────────────────────

export function DecayTab({ entries, isLoading }: {
  readonly entries: readonly RecallEntry[]
  readonly isLoading: boolean
}): React.ReactElement {
  if (isLoading) return <div className="flex flex-1 items-center justify-center"><Loader /></div>

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-500">
        <p className="text-sm">No data for decay analysis</p>
        <p className="text-xs">Store some facts first to monitor decay.</p>
      </div>
    )
  }

  const buckets = buildDecayBuckets(entries)
  const total = entries.length
  const sources = new Set(entries.map((e) => e.source))
  const withConv = entries.filter((e) => e.conversation_id).length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total Facts', value: total },
          { label: 'Sources', value: sources.size },
          { label: 'With Conv ID', value: withConv },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 text-center">
            <p className="text-lg font-bold text-zinc-100">{s.value}</p>
            <p className="text-[10px] text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-zinc-400">Age Distribution</h3>
        {buckets.map((b) => {
          const pct = total > 0 ? (b.count / total) * 100 : 0
          return (
            <div key={b.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-zinc-400">{b.label}</span>
                <span className="text-zinc-500">{b.count} ({pct.toFixed(0)}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div className={`h-full rounded-full ${b.color} transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Decay bucket builder ─────────────────────────────────────────────────────

interface DecayBucket { readonly label: string; readonly count: number; readonly color: string }

function buildDecayBuckets(entries: readonly RecallEntry[]): readonly DecayBucket[] {
  const now = Date.now()
  let fresh = 0, recent = 0, aging = 0, stale = 0

  for (const entry of entries) {
    const ts = entry.timestamp ?? entry.created_at
    if (!ts) { stale++; continue }
    const ageHours = (now - new Date(ts).getTime()) / 3_600_000
    if (ageHours < 24) fresh++
    else if (ageHours < 168) recent++
    else if (ageHours < 720) aging++
    else stale++
  }

  return [
    { label: 'Fresh (< 24h)', count: fresh, color: 'bg-emerald-500' },
    { label: 'Recent (1-7d)', count: recent, color: 'bg-blue-500' },
    { label: 'Aging (7-30d)', count: aging, color: 'bg-amber-500' },
    { label: 'Stale (> 30d)', count: stale, color: 'bg-red-500' },
  ]
}
