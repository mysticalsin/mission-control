'use client'

import React from 'react'

import { Button } from '@/components/ui/button'
import type { WatchItem } from '../trading-panel'
import { formatCurrency } from '../trading-panel'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('TradingWatchlist')

// -- Component --

interface WatchlistViewProps {
  readonly items: readonly WatchItem[]
  readonly onRefresh: () => void
}

export function WatchlistView({ items, onRefresh }: WatchlistViewProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <div className="text-lg mb-2">Watchlist is empty</div>
        <div className="text-sm max-w-sm mx-auto">
          Add symbols to your watchlist to monitor prices and set alerts.
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm" className="mt-4">
          Refresh
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{items.length}</div>
          <div className="text-sm text-muted-foreground">Watched Symbols</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">
            {items.filter(i => i.price_alert_above !== null || i.price_alert_below !== null).length}
          </div>
          <div className="text-sm text-muted-foreground">Active Alerts</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">
            {new Date(
              Math.max(...items.map(i => i.created_at)) * 1000,
            ).toLocaleDateString()}
          </div>
          <div className="text-sm text-muted-foreground">Last Added</div>
        </div>
      </div>

      {/* Watchlist Table */}
      <WatchlistTable items={items} />
    </div>
  )
}

// -- Watchlist Table --

function WatchlistTable({
  items,
}: {
  readonly items: readonly WatchItem[]
}): React.JSX.Element {
  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Watched Symbols</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 pr-4">Symbol</th>
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4 text-right">Alert Above</th>
              <th className="pb-2 pr-4 text-right">Alert Below</th>
              <th className="pb-2 pr-4">Notes</th>
              <th className="pb-2 text-right">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {items.map(item => (
              <WatchlistRow key={item.id} item={item} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// -- Watchlist Row --

function WatchlistRow({ item }: { readonly item: WatchItem }): React.JSX.Element {
  const addedDate = new Date(item.created_at * 1000).toLocaleDateString()

  return (
    <tr className="hover:bg-secondary/30">
      <td className="py-2 pr-4 font-mono font-medium text-foreground">{item.symbol}</td>
      <td className="py-2 pr-4 text-muted-foreground truncate max-w-[160px]">{item.name}</td>
      <td className="py-2 pr-4 text-right">
        {item.price_alert_above !== null ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-[#10B981]/10 text-[#10B981]">
            {formatCurrency(item.price_alert_above)}
          </span>
        ) : (
          <span className="text-muted-foreground/50">--</span>
        )}
      </td>
      <td className="py-2 pr-4 text-right">
        {item.price_alert_below !== null ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-[#EF4444]/10 text-[#EF4444]">
            {formatCurrency(item.price_alert_below)}
          </span>
        ) : (
          <span className="text-muted-foreground/50">--</span>
        )}
      </td>
      <td className="py-2 pr-4 text-muted-foreground text-xs truncate max-w-[200px]">
        {item.notes || '--'}
      </td>
      <td className="py-2 text-right text-muted-foreground text-xs">{addedDate}</td>
    </tr>
  )
}
