'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { PortfolioView } from './trading/portfolio-view'
import { WatchlistView } from './trading/watchlist-view'
import { IntelView } from './trading/intel-view'

const log = createClientLogger('TradingHub')

// -- Types shared across trading views --

export interface Holding {
  readonly id: number
  readonly symbol: string
  readonly name: string
  readonly quantity: number
  readonly avg_cost: number
  readonly current_price: number
  readonly sector: string
  readonly notes: string
  readonly created_at: number
  readonly updated_at: number
}

export interface PortfolioSummary {
  readonly totalValue: number
  readonly totalCost: number
  readonly totalGainLoss: number
}

export interface SectorSlice {
  readonly name: string
  readonly value: number
}

export interface PortfolioData {
  readonly holdings: readonly Holding[]
  readonly summary: PortfolioSummary
  readonly sectors: readonly SectorSlice[]
}

export interface WatchItem {
  readonly id: number
  readonly symbol: string
  readonly name: string
  readonly price_alert_above: number | null
  readonly price_alert_below: number | null
  readonly notes: string
  readonly created_at: number
}

export interface IntelEntry {
  readonly id: number
  readonly symbol: string
  readonly sentiment: 'bullish' | 'bearish' | 'neutral'
  readonly confidence: number
  readonly reasoning: string
  readonly sources_json: string
  readonly created_at: number
}

type Tab = 'portfolio' | 'watchlist' | 'intel'

// -- Helpers --

export const formatCurrency = (value: number): string =>
  '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatPercent = (value: number): string =>
  value.toFixed(2) + '%'

export const gainColor = (value: number): string =>
  value >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'

export const gainBgColor = (value: number): string =>
  value >= 0 ? 'bg-[#10B981]/10' : 'bg-[#EF4444]/10'

// -- Main Component --

export function TradingPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('portfolio')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data per tab
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null)
  const [watchlistData, setWatchlistData] = useState<readonly WatchItem[]>([])
  const [intelData, setIntelData] = useState<readonly IntelEntry[]>([])

  const loadTab = useCallback(async (activeTab: Tab): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/trading?tab=${activeTab}`)
      if (!res.ok) throw new Error(`Failed to load ${activeTab}`)
      const json = await res.json()

      if (activeTab === 'portfolio') {
        setPortfolioData(json as PortfolioData)
      } else if (activeTab === 'watchlist') {
        setWatchlistData(json.items ?? [])
      } else {
        setIntelData(json.intel ?? [])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      log.error({ err }, 'Failed to load trading data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadTab(tab) }, [tab, loadTab])

  const handleRefresh = useCallback((): void => {
    loadTab(tab)
  }, [tab, loadTab])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Trading Hub</h1>
            <p className="text-muted-foreground mt-1">
              Portfolio management, watchlists, and AI-powered market intelligence
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['portfolio', 'watchlist', 'intel'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'intel' ? 'Intel' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <Button onClick={handleRefresh} variant="secondary" size="sm">
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="text-center py-12">
          <p className="text-[#EF4444] text-lg mb-2">Failed to load data</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            Retry
          </Button>
        </div>
      ) : isLoading && !portfolioData && watchlistData.length === 0 && intelData.length === 0 ? (
        <Loader variant="panel" label={`Loading ${tab} data`} />
      ) : tab === 'portfolio' ? (
        <PortfolioView data={portfolioData} onRefresh={handleRefresh} />
      ) : tab === 'watchlist' ? (
        <WatchlistView items={watchlistData} onRefresh={handleRefresh} />
      ) : (
        <IntelView entries={intelData} onRefresh={handleRefresh} />
      )}
    </div>
  )
}
