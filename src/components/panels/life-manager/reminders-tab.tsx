'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClientLogger } from '@/lib/client-logger'
import type { Reminder, Priority, ReminderStatus, PRIORITY_CLASSES as PriorityClasses } from './types'

const log = createClientLogger('LifeReminders')

// ── Helpers ─────────────────────────────────────────────────────────────

function isOverdue(dueAt: string): boolean {
  return new Date(dueAt) < new Date()
}

function formatDueDate(dueAt: string): string {
  const date = new Date(dueAt)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))

  if (diffHours < 0) return `${Math.abs(diffHours)}h overdue`
  if (diffHours < 24) return `in ${diffHours}h`
  return date.toLocaleDateString()
}

// ── Props ───────────────────────────────────────────────────────────────

interface RemindersTabProps {
  readonly reminders: readonly Reminder[]
  readonly priorityClasses: typeof PriorityClasses
  readonly onAction: (
    method: string,
    body: Record<string, unknown>,
  ) => Promise<void>
}

// ── Create Form ─────────────────────────────────────────────────────────

function CreateReminderForm({
  onSubmit,
}: {
  readonly onSubmit: (data: Record<string, unknown>) => Promise<void>
}): React.ReactElement {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [isRecurring, setIsRecurring] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!title.trim() || !dueAt) return
    await onSubmit({
      action: 'create_reminder',
      title: title.trim(),
      description: description.trim(),
      due_at: dueAt,
      priority,
      is_recurring: isRecurring,
    })
    setTitle('')
    setDescription('')
    setDueAt('')
    setPriority('medium')
    setIsRecurring(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">New Reminder</h3>
      <input
        type="text" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Title" required maxLength={200}
        className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
      />
      <textarea
        value={description} onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)" maxLength={2000} rows={2}
        className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground resize-none"
      />
      <div className="flex gap-3 flex-wrap">
        <input
          type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)}
          required
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground"
        />
        <select
          value={priority} onChange={e => setPriority(e.target.value as Priority)}
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground"
        >
          {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
          Recurring
        </label>
      </div>
      <Button type="submit" size="sm" disabled={!title.trim() || !dueAt}>Create</Button>
    </form>
  )
}

// ── Main Component ──────────────────────────────────────────────────────

export function RemindersTab({
  reminders,
  priorityClasses,
  onAction,
}: RemindersTabProps): React.ReactElement {
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all')
  const [showForm, setShowForm] = useState(false)

  function filterReminders(): readonly Reminder[] {
    const now = new Date()
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    switch (filter) {
      case 'overdue':
        return reminders.filter(r => r.status === 'pending' && isOverdue(r.due_at))
      case 'today':
        return reminders.filter(r => new Date(r.due_at) <= endOfDay && new Date(r.due_at) >= now)
      case 'upcoming':
        return reminders.filter(r => new Date(r.due_at) > endOfDay)
      default:
        return reminders
    }
  }

  async function handleStatusChange(id: number, status: ReminderStatus): Promise<void> {
    await onAction('PATCH', { entity: 'reminder', id, status })
  }

  const filtered = filterReminders()
  const overdueCount = reminders.filter(r => r.status === 'pending' && isOverdue(r.due_at)).length

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['all', 'overdue', 'today', 'upcoming'] as const).map(f => (
            <button
              key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'overdue' && overdueCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px]">
                  {overdueCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New'}
        </Button>
      </div>

      {showForm && (
        <CreateReminderForm onSubmit={async (data) => { await onAction('POST', data); setShowForm(false) }} />
      )}

      {/* Reminder list */}
      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">No reminders found</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filtered.map(reminder => {
            const overdue = reminder.status === 'pending' && isOverdue(reminder.due_at)
            return (
              <div
                key={reminder.id}
                className={`bg-card border rounded-lg p-3 ${overdue ? 'border-red-500/50' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityClasses[reminder.priority]}`}>
                        {reminder.priority}
                      </span>
                      <span className={`font-medium text-sm ${overdue ? 'text-red-400' : 'text-foreground'}`}>
                        {reminder.title}
                      </span>
                      {reminder.is_recurring === 1 && (
                        <span className="text-[10px] text-muted-foreground">recurring</span>
                      )}
                    </div>
                    {reminder.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{reminder.description}</p>
                    )}
                    <p className={`text-xs mt-1 ${overdue ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                      {formatDueDate(reminder.due_at)}
                    </p>
                  </div>
                  {reminder.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="xs" variant="success" onClick={() => handleStatusChange(reminder.id, 'completed')}>
                        Done
                      </Button>
                      <Button size="xs" variant="secondary" onClick={() => handleStatusChange(reminder.id, 'snoozed')}>
                        Snooze
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => handleStatusChange(reminder.id, 'dismissed')}>
                        Dismiss
                      </Button>
                    </div>
                  )}
                  {reminder.status !== 'pending' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      reminder.status === 'completed' ? 'bg-green-500/10 text-green-500'
                      : reminder.status === 'snoozed' ? 'bg-yellow-500/10 text-yellow-500'
                      : 'bg-secondary text-muted-foreground'
                    }`}>
                      {reminder.status}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
