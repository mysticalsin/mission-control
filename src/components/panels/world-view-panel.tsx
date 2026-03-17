'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

// ── Types ────────────────────────────────────────────────────────────────────

type WorldViewTab = 'watchtower' | 'shadowbroker'

interface TabConfig {
  readonly id: WorldViewTab
  readonly label: string
  readonly description: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const WATCHTOWER_URL = 'https://worldmonitor.app'

const TABS: readonly TabConfig[] = [
  {
    id: 'watchtower',
    label: 'Watchtower',
    description: 'OSINT Monitor — Global threat intelligence via worldmonitor.app',
  },
  {
    id: 'shadowbroker',
    label: 'Shadowbroker',
    description: 'Dark web intelligence, data breach monitoring, and OSINT analysis',
  },
] as const

// ── Component ────────────────────────────────────────────────────────────────

export function WorldViewPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<WorldViewTab>('watchtower')

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">World View</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Global intelligence and threat monitoring
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'watchtower' ? (
          <WatchtowerView />
        ) : (
          <ShadowbrokerView />
        )}
      </div>
    </div>
  )
}

// ── Watchtower Sub-view ──────────────────────────────────────────────────────
// External link to worldmonitor.app — no backend proxy needed

function WatchtowerView(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-blue-500/10 p-4">
          <svg
            className="h-10 w-10 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.97.633-3.792 1.708-5.272"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-foreground">
          Watchtower OSINT Monitor
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Real-time global threat intelligence, geopolitical monitoring, and
          open-source intelligence analysis powered by worldmonitor.app.
        </p>
      </div>

      <Button
        variant="default"
        size="lg"
        onClick={() => window.open(WATCHTOWER_URL, '_blank', 'noopener,noreferrer')}
        className="gap-2"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
        Open World Monitor
      </Button>

      <p className="text-xs text-muted-foreground">
        Opens in a new tab — no backend connection required
      </p>
    </div>
  )
}

// ── Shadowbroker Sub-view ────────────────────────────────────────────────────
// Proxied through Jarvis backend for dark web intel

function ShadowbrokerView(): React.ReactElement {
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<'domain' | 'email' | 'username' | 'ip'>('domain')
  const [results, setResults] = useState<ShadowbrokerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (): Promise<void> => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const res = await fetch('/api/shadowbroker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), type: searchType }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data: ShadowbrokerResult = await res.json()
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Search bar */}
      <div className="flex gap-2">
        <select
          value={searchType}
          onChange={e => setSearchType(e.target.value as typeof searchType)}
          className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
        >
          <option value="domain">Domain</option>
          <option value="email">Email</option>
          <option value="username">Username</option>
          <option value="ip">IP Address</option>
        </select>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={`Search by ${searchType}...`}
          className="flex-1 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <Button
          variant="default"
          size="sm"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
        >
          {loading ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-4">
        {results ? (
          <ShadowbrokerResults data={results} />
        ) : (
          <EmptyShadowbroker loading={loading} />
        )}
      </div>
    </div>
  )
}

// ── Shadowbroker sub-components ──────────────────────────────────────────────

interface ShadowbrokerResult {
  readonly breaches?: readonly BreachEntry[]
  readonly exposures?: readonly ExposureEntry[]
  readonly summary?: string
  readonly risk_score?: number
}

interface BreachEntry {
  readonly source: string
  readonly date: string
  readonly records_exposed: number
  readonly data_types: readonly string[]
}

interface ExposureEntry {
  readonly type: string
  readonly value: string
  readonly source: string
  readonly first_seen: string
}

function ShadowbrokerResults({ data }: { readonly data: ShadowbrokerResult }): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      {/* Summary & risk */}
      {data.summary && (
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-foreground">{data.summary}</p>
          {data.risk_score !== undefined && (
            <RiskBadge score={data.risk_score} />
          )}
        </div>
      )}

      {/* Breaches */}
      {data.breaches && data.breaches.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">
            Data Breaches ({data.breaches.length})
          </h4>
          <div className="flex flex-col gap-2">
            {data.breaches.map((breach, i) => (
              <div key={`breach-${i}`} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{breach.source}</span>
                  <span className="text-xs text-muted-foreground">{breach.date}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {breach.records_exposed.toLocaleString()} records — {breach.data_types.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exposures */}
      {data.exposures && data.exposures.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">
            Exposures ({data.exposures.length})
          </h4>
          <div className="flex flex-col gap-2">
            {data.exposures.map((exp, i) => (
              <div key={`exp-${i}`} className="rounded-md border border-border bg-background p-3 text-sm">
                <span className="font-medium text-foreground">{exp.type}:</span>{' '}
                <span className="text-muted-foreground">{exp.value}</span>
                <span className="text-xs text-muted-foreground ml-2">({exp.source}, {exp.first_seen})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty results */}
      {(!data.breaches || data.breaches.length === 0) && (!data.exposures || data.exposures.length === 0) && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No breaches or exposures found for this query.
        </p>
      )}
    </div>
  )
}

function RiskBadge({ score }: { readonly score: number }): React.ReactElement {
  const color = score >= 80 ? 'text-red-400 border-red-500/30 bg-red-500/10'
    : score >= 50 ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
    : 'text-green-400 border-green-500/30 bg-green-500/10'
  const label = score >= 80 ? 'Critical' : score >= 50 ? 'Medium' : 'Low'

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
      Risk: {label} ({score}/100)
    </span>
  )
}

function EmptyShadowbroker({ loading }: { readonly loading: boolean }): React.ReactElement {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Scanning dark web sources...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <svg className="h-10 w-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
      </svg>
      <p className="text-sm">Enter a query to search for data breaches and exposures</p>
      <p className="text-xs">Supports domain, email, username, and IP lookups</p>
    </div>
  )
}
