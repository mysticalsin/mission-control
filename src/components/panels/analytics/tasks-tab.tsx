'use client'

import React from 'react'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import type { TasksData } from './types'
import { CHART_COLORS, formatNumber } from './constants'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('AnalyticsTasks')

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#EF4444',
  high: '#F97316',
  medium: '#EAB308',
  low: '#6B7280',
}

const STATUS_COLORS: Record<string, string> = {
  done: '#10B981',
  in_progress: '#3B82F6',
  review: '#8B5CF6',
  assigned: '#F59E0B',
  inbox: '#6B7280',
  quality_review: '#EC4899',
}

interface TasksTabProps {
  readonly data: TasksData
}

export function TasksTab({ data }: TasksTabProps): React.JSX.Element {
  const { timeline, byPriority, byStatus, avgCompletionHours } = data

  return (
    <div className="space-y-6">
      {/* Avg completion time card */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-3xl font-bold text-foreground">
          {avgCompletionHours > 0 ? avgCompletionHours.toFixed(1) + 'h' : '-'}
        </div>
        <div className="text-sm text-muted-foreground">
          Average Task Completion Time
        </div>
      </div>

      {/* Tasks created vs completed over time */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Tasks Created vs Completed</h2>
        <div className="h-64">
          {timeline.length === 0 ? (
            <EmptyChart message="No task timeline data" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone" dataKey="created" stroke="#8884d8"
                  fill="#8884d8" fillOpacity={0.2} name="Created"
                />
                <Area
                  type="monotone" dataKey="completed" stroke="#00C49F"
                  fill="#00C49F" fillOpacity={0.2} name="Completed"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Breakdown row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* By priority */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">By Priority</h2>
          <div className="h-56">
            {byPriority.length === 0 ? (
              <EmptyChart message="No priority data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byPriority.map((p) => ({ name: p.label, value: p.count }))}
                    cx="50%" cy="50%" innerRadius={35} outerRadius={70}
                    paddingAngle={4} dataKey="value"
                  >
                    {byPriority.map((p, idx) => (
                      <Cell
                        key={p.label}
                        fill={PRIORITY_COLORS[p.label] ?? CHART_COLORS[idx % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatNumber(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* By status */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">By Status</h2>
          <div className="h-56">
            {byStatus.length === 0 ? (
              <EmptyChart message="No status data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byStatus.map((s) => ({ name: s.label, value: s.count }))}
                    cx="50%" cy="50%" innerRadius={35} outerRadius={70}
                    paddingAngle={4} dataKey="value"
                  >
                    {byStatus.map((s, idx) => (
                      <Cell
                        key={s.label}
                        fill={STATUS_COLORS[s.label] ?? CHART_COLORS[idx % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatNumber(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyChart({ message }: { readonly message: string }): React.JSX.Element {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      {message}
    </div>
  )
}
