'use client'

import React from 'react'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { OverviewData } from './types'
import { formatNumber, formatPercent } from './constants'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('AnalyticsOverview')

interface MetricCardProps {
  readonly label: string
  readonly value: string
  readonly accent?: string
}

function MetricCard({ label, value, accent }: MetricCardProps): React.JSX.Element {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className={`text-3xl font-bold ${accent ?? 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  )
}

interface OverviewTabProps {
  readonly data: OverviewData
}

export function OverviewTab({ data }: OverviewTabProps): React.JSX.Element {
  const { metrics, activityTimeline } = data

  return (
    <div className="space-y-6">
      {/* Key metrics cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard label="Total Agents" value={String(metrics.totalAgents)} />
        <MetricCard
          label="Active Agents"
          value={String(metrics.activeAgents)}
          accent="text-green-500"
        />
        <MetricCard
          label="Active Sessions"
          value={String(metrics.activeSessions)}
          accent="text-blue-500"
        />
        <MetricCard
          label="Tasks Completed"
          value={formatNumber(metrics.tasksCompleted)}
          accent="text-emerald-500"
        />
        <MetricCard
          label="Total Tasks"
          value={formatNumber(metrics.totalTasks)}
        />
        <MetricCard
          label="Uptime"
          value={formatPercent(metrics.uptimePercent)}
          accent={metrics.uptimePercent >= 99 ? 'text-green-500' : 'text-yellow-500'}
        />
      </div>

      {/* System activity line chart */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">System Activity Over Time</h2>
        <div className="h-72">
          {activityTimeline.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No activity data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityTimeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone" dataKey="tasks" stroke="#00C49F"
                  strokeWidth={2} name="Tasks" dot={false}
                />
                <Line
                  type="monotone" dataKey="sessions" stroke="#0088FE"
                  strokeWidth={2} name="Sessions" dot={false}
                />
                <Line
                  type="monotone" dataKey="activities" stroke="#FFBB28"
                  strokeWidth={2} name="Activities" dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
