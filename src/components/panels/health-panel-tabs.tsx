'use client'

import { useState } from 'react'

// ── Types (re-exported so health-panel.tsx can share them) ─────────────────

export type MetricType =
  | 'weight' | 'bp_systolic' | 'bp_diastolic' | 'heart_rate'
  | 'steps' | 'sleep_hours' | 'calories' | 'mood'

export type GoalStatus = 'active' | 'achieved' | 'missed'

export interface LatestMetric { metric_type: MetricType; value: number; recorded_at: number }

export interface TrendPoint {
  metric_type: MetricType; day: string; avg_value: number; count: number
}

export interface DashboardData {
  latest: LatestMetric[]
  trends: TrendPoint[]
  defaultUnits: Record<MetricType, string>
}

export interface MetricRow {
  id: number; metric_type: MetricType; value: number; unit: string
  notes: string; recorded_at: number
}

export interface GoalRow {
  id: number; metric_type: string; target_value: number; current_value: number
  deadline: string | null; status: GoalStatus; created_at: number
}

// ── Constants ──────────────────────────────────────────────────────────────

export const METRIC_LABELS: Record<MetricType, string> = {
  weight: 'Weight', bp_systolic: 'BP Systolic', bp_diastolic: 'BP Diastolic',
  heart_rate: 'Heart Rate', steps: 'Steps', sleep_hours: 'Sleep',
  calories: 'Calories', mood: 'Mood',
}

export const METRIC_TYPES = Object.keys(METRIC_LABELS) as MetricType[]

const STATUS_COLORS: Record<GoalStatus, string> = {
  active: 'text-blue-400', achieved: 'text-emerald-400', missed: 'text-red-400',
}

// ── MetricCard ─────────────────────────────────────────────────────────────

function MetricCard({ metric, unit }: {
  readonly metric: LatestMetric | undefined
  readonly unit: string
}): React.ReactElement {
  if (!metric) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 text-center">
        <p className="text-xs text-muted-foreground">No data yet</p>
      </div>
    )
  }
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-2xl font-bold text-foreground">
        {metric.value}
        <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {new Date(metric.recorded_at * 1000).toLocaleDateString()}
      </p>
    </div>
  )
}

// ── DashboardTab ───────────────────────────────────────────────────────────

export function DashboardTab({ data }: { readonly data: DashboardData }): React.ReactElement {
  const latestMap = new Map(data.latest.map(m => [m.metric_type, m]))

  if (data.latest.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No metrics recorded yet.</p>
        <p className="text-sm mt-1">Switch to Metrics tab to log your first entry.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Latest Readings
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {METRIC_TYPES.map(type => (
          <div key={type} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{METRIC_LABELS[type]}</p>
            <MetricCard metric={latestMap.get(type)} unit={data.defaultUnits[type] ?? ''} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MetricsTab ─────────────────────────────────────────────────────────────

export function MetricsTab({ metrics, onAction, defaultUnits }: {
  readonly metrics: MetricRow[]
  readonly onAction: (method: string, body: Record<string, unknown>) => Promise<void>
  readonly defaultUnits: Record<MetricType, string>
}): React.ReactElement {
  const [type, setType] = useState<MetricType>('weight')
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const num = parseFloat(value)
    if (isNaN(num)) return
    setSubmitting(true)
    await onAction('POST', { action: 'record_metric', metric_type: type, value: num, notes })
    setValue('')
    setNotes('')
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Record Metric</h3>
        <div className="flex flex-wrap gap-3">
          <select
            value={type}
            onChange={e => setType(e.target.value as MetricType)}
            className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground"
          >
            {METRIC_TYPES.map(t => <option key={t} value={t}>{METRIC_LABELS[t]}</option>)}
          </select>
          <input
            type="number" step="any" required
            placeholder={`Value (${defaultUnits[type] ?? ''})`}
            value={value}
            onChange={e => setValue(e.target.value)}
            className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground w-32"
          />
          <input
            type="text" placeholder="Notes (optional)"
            value={notes} onChange={e => setNotes(e.target.value)}
            className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground flex-1 min-w-0"
          />
          <button
            type="submit" disabled={submitting || !value}
            className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {metrics.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No metrics logged yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Value</th>
                <th className="py-2 pr-4">Notes</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => (
                <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-4 text-foreground">{METRIC_LABELS[m.metric_type]}</td>
                  <td className="py-2 pr-4 font-mono text-foreground">{m.value} {m.unit}</td>
                  <td className="py-2 pr-4 text-muted-foreground max-w-xs truncate">{m.notes || '—'}</td>
                  <td className="py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(m.recorded_at * 1000).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── GoalProgressBar ────────────────────────────────────────────────────────

function GoalProgressBar({ goal }: { readonly goal: GoalRow }): React.ReactElement {
  const pct = goal.target_value > 0
    ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
    : 0
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {METRIC_LABELS[goal.metric_type as MetricType] ?? goal.metric_type}
        </span>
        <span className={`text-xs font-medium capitalize ${STATUS_COLORS[goal.status]}`}>
          {goal.status}
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Current: {goal.current_value}</span>
        <span>Target: {goal.target_value}</span>
      </div>
      {goal.deadline && <p className="text-xs text-muted-foreground">Deadline: {goal.deadline}</p>}
    </div>
  )
}

// ── GoalsTab ───────────────────────────────────────────────────────────────

export function GoalsTab({ goals, onAction }: {
  readonly goals: GoalRow[]
  readonly onAction: (method: string, body: Record<string, unknown>) => Promise<void>
}): React.ReactElement {
  const [type, setType] = useState<MetricType>('weight')
  const [target, setTarget] = useState('')
  const [deadline, setDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const num = parseFloat(target)
    if (isNaN(num)) return
    setSubmitting(true)
    await onAction('POST', {
      action: 'create_goal', metric_type: type, target_value: num,
      ...(deadline ? { deadline } : {}),
    })
    setTarget('')
    setDeadline('')
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Create Goal</h3>
        <div className="flex flex-wrap gap-3">
          <select
            value={type} onChange={e => setType(e.target.value as MetricType)}
            className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground"
          >
            {METRIC_TYPES.map(t => <option key={t} value={t}>{METRIC_LABELS[t]}</option>)}
          </select>
          <input
            type="number" step="any" required placeholder="Target value"
            value={target} onChange={e => setTarget(e.target.value)}
            className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground w-32"
          />
          <input
            type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground"
          />
          <button
            type="submit" disabled={submitting || !target}
            className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Add Goal'}
          </button>
        </div>
      </form>

      {goals.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No goals set yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {goals.map(g => <GoalProgressBar key={g.id} goal={g} />)}
        </div>
      )}
    </div>
  )
}
