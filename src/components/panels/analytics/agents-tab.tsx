'use client'

import React from 'react'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { AgentsData } from './types'
import { CHART_COLORS, STATUS_COLORS, formatPercent } from './constants'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('AnalyticsAgents')

interface AgentsTabProps {
  readonly data: AgentsData
}

export function AgentsTab({ data }: AgentsTabProps): React.JSX.Element {
  const { topAgents, statusDistribution } = data

  const barData = topAgents.slice(0, 12).map((agent) => ({
    name: agent.name.length > 14 ? agent.name.slice(0, 13) + '\u2026' : agent.name,
    completed: agent.tasksCompleted,
  }))

  const pieData = statusDistribution.map((entry) => ({
    name: entry.status,
    value: entry.count,
  }))

  return (
    <div className="space-y-6">
      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top agents by task completion */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">
            Top Agents by Tasks Completed
          </h2>
          <div className="h-64">
            {barData.length === 0 ? (
              <EmptyChart message="No agent task data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="completed" fill="#00C49F" name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Status distribution pie */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Agent Status Distribution</h2>
          <div className="h-64">
            {pieData.length === 0 ? (
              <EmptyChart message="No status data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="50%"
                    innerRadius={40} outerRadius={80}
                    paddingAngle={4} dataKey="value"
                  >
                    {pieData.map((entry, idx) => (
                      <Cell
                        key={entry.name}
                        fill={STATUS_COLORS[entry.name] ?? CHART_COLORS[idx % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Agent metrics table */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Agent Performance Metrics</h2>
        {topAgents.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            No agent metrics available
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium text-right">Completed</th>
                  <th className="pb-2 font-medium text-right">Avg Response</th>
                  <th className="pb-2 font-medium text-right">Success Rate</th>
                  <th className="pb-2 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {topAgents.map((agent) => (
                  <tr key={agent.name} className="text-foreground">
                    <td className="py-2 font-medium">{agent.name}</td>
                    <td className="py-2 text-muted-foreground">{agent.role}</td>
                    <td className="py-2 text-right">{agent.tasksCompleted}</td>
                    <td className="py-2 text-right">
                      {agent.avgResponseTimeSec > 0
                        ? agent.avgResponseTimeSec.toFixed(1) + 's'
                        : '-'}
                    </td>
                    <td className="py-2 text-right">{formatPercent(agent.successRate)}</td>
                    <td className="py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        agent.status === 'idle' ? 'bg-green-500/10 text-green-500' :
                        agent.status === 'busy' ? 'bg-yellow-500/10 text-yellow-500' :
                        agent.status === 'error' ? 'bg-red-500/10 text-red-500' :
                        'bg-secondary text-muted-foreground'
                      }`}>
                        {agent.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
