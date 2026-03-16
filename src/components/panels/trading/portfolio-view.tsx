'use client'

import React from 'react'

import { Button } from '@/components/ui/button'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { PortfolioData, SectorSlice } from '../trading-panel'
import { formatCurrency, formatPercent, gainColor, gainBgColor } from '../trading-panel'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('TradingPortfolio')

// -- Constants --

const SECTOR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316',
]

// -- Component --

interface PortfolioViewProps {
  readonly data: PortfolioData | null
  readonly onRefresh: () => void
}

export function PortfolioView({ data, onRefresh }: PortfolioViewProps): React.JSX.Element {
  if (!data || data.holdings.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <div className="text-lg mb-2">No holdings yet</div>
        <div className="text-sm max-w-sm mx-auto">
          Add positions to your portfolio to track performance, allocation, and gain/loss.
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm" className="mt-4">
          Refresh
        </Button>
      </div>
    )
  }

  const { holdings, summary, sectors } = data

  return (
    <div className="space-y-6">
      <SummaryCards summary={summary} holdingCount={holdings.length} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <HoldingsTable holdings={holdings} totalValue={summary.totalValue} />
        </div>
        <AllocationChart sectors={sectors} />
      </div>
    </div>
  )
}

// -- Summary Cards --

function SummaryCards({
  summary,
  holdingCount,
}: {
  readonly summary: PortfolioData['summary']
  readonly holdingCount: number
}): React.JSX.Element {
  const gainLossPct = summary.totalCost > 0
    ? ((summary.totalGainLoss / summary.totalCost) * 100)
    : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-3xl font-bold text-foreground">{formatCurrency(summary.totalValue)}</div>
        <div className="text-sm text-muted-foreground">Total Value</div>
      </div>
      <div className="bg-card border border-border rounded-lg p-5">
        <div className={`text-3xl font-bold ${gainColor(summary.totalGainLoss)}`}>
          {summary.totalGainLoss >= 0 ? '+' : ''}{formatCurrency(summary.totalGainLoss)}
        </div>
        <div className="text-sm text-muted-foreground">Total Gain/Loss</div>
      </div>
      <div className="bg-card border border-border rounded-lg p-5">
        <div className={`text-3xl font-bold ${gainColor(gainLossPct)}`}>
          {gainLossPct >= 0 ? '+' : ''}{formatPercent(gainLossPct)}
        </div>
        <div className="text-sm text-muted-foreground">Return</div>
      </div>
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-3xl font-bold text-foreground">{holdingCount}</div>
        <div className="text-sm text-muted-foreground">Positions</div>
      </div>
    </div>
  )
}

// -- Holdings Table --

function HoldingsTable({
  holdings,
  totalValue,
}: {
  readonly holdings: PortfolioData['holdings']
  readonly totalValue: number
}): React.JSX.Element {
  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Holdings</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 pr-4">Symbol</th>
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4 text-right">Qty</th>
              <th className="pb-2 pr-4 text-right">Avg Cost</th>
              <th className="pb-2 pr-4 text-right">Price</th>
              <th className="pb-2 pr-4 text-right">Value</th>
              <th className="pb-2 pr-4 text-right">Gain/Loss</th>
              <th className="pb-2 text-right">Alloc %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {holdings.map(h => {
              const value = h.quantity * h.current_price
              const cost = h.quantity * h.avg_cost
              const gainLoss = value - cost
              const gainLossPct = cost > 0 ? (gainLoss / cost) * 100 : 0
              const alloc = totalValue > 0 ? (value / totalValue) * 100 : 0

              return (
                <tr key={h.id} className="hover:bg-secondary/30">
                  <td className="py-2 pr-4 font-mono font-medium text-foreground">{h.symbol}</td>
                  <td className="py-2 pr-4 text-muted-foreground truncate max-w-[120px]">{h.name}</td>
                  <td className="py-2 pr-4 text-right text-foreground">{h.quantity}</td>
                  <td className="py-2 pr-4 text-right text-muted-foreground">{formatCurrency(h.avg_cost)}</td>
                  <td className="py-2 pr-4 text-right text-foreground">{formatCurrency(h.current_price)}</td>
                  <td className="py-2 pr-4 text-right font-medium text-foreground">{formatCurrency(value)}</td>
                  <td className="py-2 pr-4 text-right">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${gainBgColor(gainLoss)} ${gainColor(gainLoss)}`}>
                      {gainLoss >= 0 ? '+' : ''}{formatPercent(gainLossPct)}
                    </span>
                  </td>
                  <td className="py-2 text-right text-muted-foreground">{formatPercent(alloc)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// -- Allocation Pie Chart --

function AllocationChart({
  sectors,
}: {
  readonly sectors: readonly SectorSlice[]
}): React.JSX.Element {
  if (sectors.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Sector Allocation</h2>
        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
          No sector data
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Sector Allocation</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={sectors as SectorSlice[]}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
            >
              {sectors.map((_, i) => (
                <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => formatCurrency(Number(v))}
              contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
