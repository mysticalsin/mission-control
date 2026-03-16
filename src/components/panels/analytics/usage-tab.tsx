'use client'

import React from 'react'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { UsageData } from './types'
import { DAY_LABELS, formatNumber } from './constants'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('AnalyticsUsage')

interface UsageTabProps {
  readonly data: UsageData
}

export function UsageTab({ data }: UsageTabProps): React.JSX.Element {
  const { heatmap, topUsers, avgSessionMinutes, peakHour, peakDay } = data

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">
            {avgSessionMinutes > 0 ? avgSessionMinutes.toFixed(0) + 'm' : '-'}
          </div>
          <div className="text-sm text-muted-foreground">Avg Session Duration</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-blue-500">
            {peakHour >= 0 ? `${peakHour}:00` : '-'}
          </div>
          <div className="text-sm text-muted-foreground">Peak Hour</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-blue-500">
            {peakDay >= 0 && peakDay < 7 ? DAY_LABELS[peakDay] : '-'}
          </div>
          <div className="text-sm text-muted-foreground">Peak Day</div>
        </div>
      </div>

      {/* Activity heatmap (grid-based) */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Activity Heatmap</h2>
        {heatmap.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            No heatmap data available
          </p>
        ) : (
          <HeatmapGrid heatmap={heatmap} />
        )}
      </div>

      {/* Top users bar chart */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Top Users / Actors</h2>
        <div className="h-64">
          {topUsers.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No user activity data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topUsers.slice(0, 10).map((u) => ({
                  name: u.name.length > 14 ? u.name.slice(0, 13) + '\u2026' : u.name,
                  actions: u.actions,
                }))}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category" dataKey="name"
                  tick={{ fontSize: 11 }} width={100}
                />
                <Tooltip formatter={(v) => formatNumber(Number(v))} />
                <Bar dataKey="actions" fill="#8884d8" name="Actions" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

// -- Heatmap grid component --

interface HeatmapGridProps {
  readonly heatmap: UsageData['heatmap']
}

function HeatmapGrid({ heatmap }: HeatmapGridProps): React.JSX.Element {
  const maxCount = Math.max(...heatmap.map((c) => c.count), 1)

  // Build a 7x24 lookup for fast cell rendering
  const cellMap = new Map<string, number>()
  for (const cell of heatmap) {
    cellMap.set(`${cell.day}-${cell.hour}`, cell.count)
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Hour labels */}
        <div className="flex ml-12 mb-1">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
              {h % 4 === 0 ? `${h}h` : ''}
            </div>
          ))}
        </div>
        {/* Day rows */}
        {DAY_LABELS.map((dayLabel, dayIdx) => (
          <div key={dayLabel} className="flex items-center gap-1 mb-0.5">
            <div className="w-10 text-xs text-muted-foreground text-right pr-1">
              {dayLabel}
            </div>
            {Array.from({ length: 24 }, (_, hour) => {
              const count = cellMap.get(`${dayIdx}-${hour}`) ?? 0
              const intensity = maxCount > 0 ? count / maxCount : 0
              return (
                <div
                  key={hour}
                  className="flex-1 h-5 rounded-sm border border-border/30"
                  style={{
                    backgroundColor: intensity > 0
                      ? `rgba(59, 130, 246, ${0.1 + intensity * 0.8})`
                      : 'transparent',
                  }}
                  title={`${dayLabel} ${hour}:00 - ${count} activities`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
