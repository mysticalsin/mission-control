'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClientLogger } from '@/lib/client-logger'
import type { ActionItem, ActionItemStatus } from './types'
import { statusBadgeClass } from './types'

const log = createClientLogger('MeetingsActions')

interface ActionsTabProps {
  readonly actions: readonly ActionItem[]
  readonly onRefresh: () => void
}

// ── Actions Tab ─────────────────────────────────────

export function ActionsTab({ actions, onRefresh }: ActionsTabProps): React.JSX.Element {
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterStatus, setFilterStatus] = useState<ActionItemStatus | ''>('')

  // Derive unique assignees for the filter dropdown
  const assignees = Array.from(
    new Set(actions.map((a) => a.assignee).filter(Boolean) as string[])
  ).sort()

  const filtered = actions.filter((action) => {
    if (filterAssignee && action.assignee !== filterAssignee) return false
    if (filterStatus && action.status !== filterStatus) return false
    return true
  })

  // Group counts for summary
  const openCount = actions.filter((a) => a.status === 'open').length
  const inProgressCount = actions.filter((a) => a.status === 'in-progress').length
  const doneCount = actions.filter((a) => a.status === 'done').length

  if (actions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <div className="text-lg mb-2">No action items</div>
        <div className="text-sm mb-4">
          Action items extracted from meetings will appear here.
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm">Refresh</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <StatusCard label="Open" count={openCount} color="#F59E0B" />
        <StatusCard label="In Progress" count={inProgressCount} color="#3B82F6" />
        <StatusCard label="Done" count={doneCount} color="#10B981" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Assignees</option>
          {assignees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ActionItemStatus | '')}
          className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Action Items Table */}
      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          No action items match the selected filters.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Description</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Assignee</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Due Date</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Meeting</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <ActionRow key={item.id} item={item} onRefresh={onRefresh} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Status Summary Card ─────────────────────────────

function StatusCard({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color: string
}): React.JSX.Element {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-2xl font-bold text-foreground" style={{ color }}>
        {count}
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  )
}

// ── Action Item Row ─────────────────────────────────

function ActionRow({
  item,
  onRefresh,
}: {
  item: ActionItem
  onRefresh: () => void
}): React.JSX.Element {
  const [updating, setUpdating] = useState(false)

  async function handleStatusChange(newStatus: ActionItemStatus): Promise<void> {
    setUpdating(true)
    try {
      const res = await fetch('/api/meetings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete_action_item',
          id: item.id,
          status: newStatus,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to update status')
      }

      onRefresh()
    } catch (err) {
      log.error('Failed to update action item:', err)
    } finally {
      setUpdating(false)
    }
  }

  const dueDate = item.due_date ? new Date(item.due_date) : null
  const isOverdue = dueDate && dueDate < new Date() && item.status !== 'done'

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
      <td className="px-4 py-3 max-w-xs">
        <span className="text-foreground line-clamp-2">{item.description}</span>
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
        {item.assignee ?? <span className="italic">Unassigned</span>}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {dueDate ? (
          <span className={isOverdue ? 'text-red-400 font-medium' : 'text-muted-foreground'}>
            {dueDate.toLocaleDateString()}
            {isOverdue && <span className="ml-1 text-xs">(overdue)</span>}
          </span>
        ) : (
          <span className="text-muted-foreground italic">No date</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`px-2 py-0.5 text-xs rounded-full border ${statusBadgeClass(item.status)}`}>
          {item.status}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground max-w-[150px] truncate">
        {item.meeting_title}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {item.status !== 'done' && (
          <Button
            onClick={() => handleStatusChange('done')}
            disabled={updating}
            variant="success"
            size="xs"
          >
            {updating ? '...' : 'Complete'}
          </Button>
        )}
        {item.status === 'open' && (
          <Button
            onClick={() => handleStatusChange('in-progress')}
            disabled={updating}
            variant="ghost"
            size="xs"
            className="ml-1"
          >
            Start
          </Button>
        )}
      </td>
    </tr>
  )
}
