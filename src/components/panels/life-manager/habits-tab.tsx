'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClientLogger } from '@/lib/client-logger'
import type { Habit, HabitLogEntry, HabitFrequency } from './types'

const log = createClientLogger('LifeHabits')

// ── Streak Calendar ─────────────────────────────────────────────────────

function StreakCalendar({
  logs,
}: {
  readonly logs: readonly HabitLogEntry[]
}): React.ReactElement {
  // Build a 28-day grid showing completion status
  const today = new Date()
  const completedDates = new Set(
    logs.map(l => new Date(l.completed_at).toISOString().split('T')[0]),
  )

  const days = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(today)
    date.setDate(date.getDate() - (27 - i))
    return date.toISOString().split('T')[0]
  })

  return (
    <div className="flex gap-0.5 flex-wrap">
      {days.map(day => {
        const completed = completedDates.has(day)
        const isToday = day === today.toISOString().split('T')[0]
        return (
          <div
            key={day}
            title={day}
            className={`w-3 h-3 rounded-sm ${
              completed
                ? 'bg-green-500'
                : isToday
                  ? 'bg-primary/30 border border-primary/50'
                  : 'bg-secondary'
            }`}
          />
        )
      })}
    </div>
  )
}

// ── Create Form ─────────────────────────────────────────────────────────

function CreateHabitForm({
  onSubmit,
}: {
  readonly onSubmit: (data: Record<string, unknown>) => Promise<void>
}): React.ReactElement {
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<HabitFrequency>('daily')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) return
    await onSubmit({
      action: 'create_habit',
      name: name.trim(),
      frequency,
    })
    setName('')
    setFrequency('daily')
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">New Habit</h3>
      <div className="flex gap-3">
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Habit name" required maxLength={200}
          className="flex-1 bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <select
          value={frequency} onChange={e => setFrequency(e.target.value as HabitFrequency)}
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <Button type="submit" size="sm" disabled={!name.trim()}>Add</Button>
      </div>
    </form>
  )
}

// ── Props ───────────────────────────────────────────────────────────────

interface HabitsTabProps {
  readonly habits: readonly Habit[]
  readonly habitLogs: Record<number, readonly HabitLogEntry[]>
  readonly onAction: (
    method: string,
    body: Record<string, unknown>,
  ) => Promise<void>
}

// ── Main Component ──────────────────────────────────────────────────────

export function HabitsTab({
  habits,
  habitLogs,
  onAction,
}: HabitsTabProps): React.ReactElement {
  const [showForm, setShowForm] = useState(false)

  function isCompletedToday(habitId: number): boolean {
    const logs = habitLogs[habitId] ?? []
    const todayStr = new Date().toISOString().split('T')[0]
    return logs.some(l => l.completed_at.startsWith(todayStr))
  }

  async function handleToggleToday(habitId: number): Promise<void> {
    await onAction('PATCH', {
      entity: 'habit',
      id: habitId,
      toggle_today: true,
    })
  }

  async function handleDelete(habitId: number): Promise<void> {
    await onAction('DELETE', { entity: 'habit', id: habitId })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Habit Tracker
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New Habit'}
        </Button>
      </div>

      {showForm && (
        <CreateHabitForm onSubmit={async (data) => { await onAction('POST', data); setShowForm(false) }} />
      )}

      {habits.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-lg mb-2">No habits tracked</p>
          <p className="text-sm">Start building habits by adding one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {habits.map(habit => {
            const completedToday = isCompletedToday(habit.id)
            const completionRate = habit.total_completions > 0
              ? Math.round((habit.current_streak / Math.max(1, habit.total_completions)) * 100)
              : 0
            const logs = habitLogs[habit.id] ?? []

            return (
              <div key={habit.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => handleToggleToday(habit.id)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          completedToday
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-border hover:border-primary'
                        }`}
                        title={completedToday ? 'Completed today' : 'Mark as done'}
                      >
                        {completedToday && (
                          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="2,6 5,9 10,3" />
                          </svg>
                        )}
                      </button>
                      <span className="font-medium text-sm text-foreground">{habit.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {habit.frequency}
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                      <span>Streak: <span className="text-foreground font-medium">{habit.current_streak}</span></span>
                      <span>Best: <span className="text-foreground font-medium">{habit.best_streak}</span></span>
                      <span>Total: <span className="text-foreground font-medium">{habit.total_completions}</span></span>
                      <span>Rate: <span className="text-foreground font-medium">{completionRate}%</span></span>
                    </div>

                    {/* Streak calendar */}
                    <StreakCalendar logs={logs} />
                  </div>

                  <Button
                    size="xs" variant="ghost"
                    onClick={() => handleDelete(habit.id)}
                    className="text-muted-foreground hover:text-red-400 shrink-0"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
