'use client'

import React from 'react'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import type { CostsData } from './types'
import { CHART_COLORS, formatCost, formatPercent } from './constants'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('AnalyticsCosts')

interface CostsTabProps {
  readonly data: CostsData
}

export function CostsTab({ data }: CostsTabProps): React.JSX.Element {
  const { timeline, models, byDepartment, totalCost, budgetUsedPercent } = data

  const deptPieData = byDepartment.map((d) => ({
    name: d.department,
    value: d.cost,
  }))

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{formatCost(totalCost)}</div>
          <div className="text-sm text-muted-foreground">Total Cost</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{models.length}</div>
          <div className="text-sm text-muted-foreground">Models Used</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className={`text-3xl font-bold ${
            budgetUsedPercent > 90 ? 'text-red-500' :
            budgetUsedPercent > 70 ? 'text-yellow-500' : 'text-green-500'
          }`}>
            {formatPercent(budgetUsedPercent)}
          </div>
          <div className="text-sm text-muted-foreground">Budget Used</div>
        </div>
      </div>

      {/* Stacked bar chart: costs by model over time */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Cost by Model Over Time</h2>
        <div className="h-72">
          {timeline.length === 0 ? (
            <EmptyChart message="No cost timeline data" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCost(Number(v))} />
                <Legend />
                {models.map((model, idx) => (
                  <Bar
                    key={model} dataKey={model} stackId="cost"
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    name={model}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Department cost distribution */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Cost by Department</h2>
        <div className="h-64">
          {deptPieData.length === 0 ? (
            <EmptyChart message="No department cost data" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={deptPieData} cx="50%" cy="50%"
                  innerRadius={40} outerRadius={80}
                  paddingAngle={4} dataKey="value"
                >
                  {deptPieData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCost(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
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
