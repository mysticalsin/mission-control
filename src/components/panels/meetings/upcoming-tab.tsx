'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClientLogger } from '@/lib/client-logger'
import type { Meeting } from './types'
import { parseMeeting, durationMinutes, formatDuration } from './types'

const log = createClientLogger('MeetingsUpcoming')

interface UpcomingTabProps {
  readonly meetings: readonly Meeting[]
  readonly onRefresh: () => void
}

// ── Upcoming Tab ────────────────────────────────────

export function UpcomingTab({ meetings, onRefresh }: UpcomingTabProps): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)

  if (meetings.length === 0 && !showForm) {
    return (
      <EmptyUpcoming
        onAdd={() => setShowForm(true)}
        onRefresh={onRefresh}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {meetings.length} Upcoming Meeting{meetings.length !== 1 ? 's' : ''}
        </h2>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          {showForm ? 'Cancel' : 'Add Meeting'}
        </Button>
      </div>

      {showForm && (
        <AddMeetingForm
          onCreated={() => { setShowForm(false); onRefresh() }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="space-y-3">
        {meetings.map((m) => {
          const parsed = parseMeeting(m)
          return <MeetingCard key={m.id} meeting={parsed} />
        })}
      </div>
    </div>
  )
}

// ── Empty State ─────────────────────────────────────

function EmptyUpcoming({
  onAdd,
  onRefresh,
}: {
  onAdd: () => void
  onRefresh: () => void
}): React.JSX.Element {
  return (
    <div className="text-center text-muted-foreground py-12">
      <div className="text-lg mb-2">No upcoming meetings</div>
      <div className="text-sm mb-4">
        Schedule a meeting to get started with agenda tracking and action items.
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button onClick={onAdd} size="sm">Add Meeting</Button>
        <Button onClick={onRefresh} variant="outline" size="sm">Refresh</Button>
      </div>
    </div>
  )
}

// ── Meeting Card ────────────────────────────────────

function MeetingCard({
  meeting,
}: {
  meeting: ReturnType<typeof parseMeeting>
}): React.JSX.Element {
  const duration = durationMinutes(meeting.start_at, meeting.end_at)
  const startDate = new Date(meeting.start_at)

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-foreground truncate">{meeting.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span>{startDate.toLocaleDateString()} at {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
        {meeting.meeting_url && (
          <a
            href={meeting.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Button variant="outline" size="sm">Join</Button>
          </a>
        )}
      </div>

      {meeting.participants.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {meeting.participants.map((participant) => (
            <span
              key={participant}
              className="px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground"
            >
              {participant}
            </span>
          ))}
        </div>
      )}

      {meeting.location && (
        <div className="mt-2 text-sm text-muted-foreground">
          Location: {meeting.location}
        </div>
      )}

      {meeting.agenda && (
        <div className="mt-3 text-sm text-muted-foreground border-t border-border/50 pt-3">
          <div className="text-xs font-medium text-foreground mb-1">Agenda</div>
          <p className="whitespace-pre-wrap">{meeting.agenda}</p>
        </div>
      )}
    </div>
  )
}

// ── Add Meeting Form ────────────────────────────────

function AddMeetingForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void
  onCancel: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [location, setLocation] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [participants, setParticipants] = useState('')
  const [agenda, setAgenda] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!title.trim() || !startAt || !endAt) {
      setFormError('Title, start, and end times are required')
      return
    }

    setSubmitting(true)
    setFormError(null)

    try {
      const participantsList = participants
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)

      const body = {
        action: 'create_meeting' as const,
        title: title.trim(),
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        ...(location.trim() && { location: location.trim() }),
        ...(meetingUrl.trim() && { meeting_url: meetingUrl.trim() }),
        ...(participantsList.length > 0 && { participants: participantsList }),
        ...(agenda.trim() && { agenda: agenda.trim() }),
      }

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create meeting')
      }

      onCreated()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Failed to create meeting:', err)
      setFormError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-lg p-5 space-y-3"
    >
      <h3 className="font-medium text-foreground">New Meeting</h3>

      {formError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          {formError}
        </div>
      )}

      <FormField label="Title" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start" required>
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
            className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
        </FormField>
        <FormField label="End" required>
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
            className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Location">
          <input value={location} onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
        </FormField>
        <FormField label="Meeting URL">
          <input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
        </FormField>
      </div>

      <FormField label="Participants (comma-separated)">
        <input value={participants} onChange={(e) => setParticipants(e.target.value)}
          placeholder="Alice, Bob, Charlie"
          className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
      </FormField>

      <FormField label="Agenda">
        <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3}
          className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground resize-y" />
      </FormField>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Meeting'}
        </Button>
        <Button type="button" onClick={onCancel} variant="ghost" size="sm">
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ── Form Field Helper ───────────────────────────────

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}
