'use client'

import React from 'react'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { PerformanceData } from './types'
import { formatMs, formatPercent } from './constants'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('AnalyticsPerformance')

interface PerformanceTabProps {
  readonly data: PerformanceData
}

export function PerformanceTab({ data }: PerformanceTabProps): React.JSX.Element {
  const { timeline, avgLatencyMs, avgThroughput, avgErrorRate } = data

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">{formatMs(avgLatencyMs)}</div>
          <div className="text-sm text-muted-foreground">Avg Latency</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-3xl font-bold text-foreground">
            {avgThroughput.toFixed(1)}/min
          </div>
          <div className="text-sm text-muted-foreground">Avg Throughput</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className={`text-3xl font-bold ${
            avgErrorRate > 5 ? 'text-red-500' :
            avgErrorRate > 1 ? 'text-yellow-500' : 'text-green-500'
          }`}>
            {formatPercent(avgErrorRate)}
          </div>
          <div className="text-sm text-muted-foreground">Avg Error Rate</div>
        </div>
      </div>

      {/* Latency percentiles */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Response Latency (p50 / p95 / p99)</h2>
        <div className="h-72">
          {timeline.length === 0 ? (
            <EmptyChart message="No latency data" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="ms" />
                <Tooltip formatter={(v) => formatMs(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="p50" stroke="#00C49F" strokeWidth={2} name="p50" dot={false} />
                <Line type="monotone" dataKey="p95" stroke="#FFBB28" strokeWidth={2} name="p95" dot={false} />
                <Line type="monotone" dataKey="p99" stroke="#FF8042" strokeWidth={2} name="p99" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Throughput and error rate */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Throughput (req/min)</h2>
          <div className="h-56">
            {timeline.length === 0 ? (
              <EmptyChart message="No throughput data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="throughput" stroke="#0088FE" strokeWidth={2} name="Throughput" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Error Rate (%)</h2>
          <div className="h-56">
            {timeline.length === 0 ? (
              <EmptyChart message="No error rate data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v) => formatPercent(Number(v))} />
                  <Line type="monotone" dataKey="errorRate" stroke="#ff6b6b" strokeWidth={2} name="Error Rate" dot={false} />
                </LineChart>
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
