'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Meeting } from './types'
import {
  parseMeeting,
  durationMinutes,
  formatDuration,
  statusBadgeClass,
} from './types'
import type { ActionItemStatus } from './types'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('MeetingsPast')

interface PastTabProps {
  readonly meetings: readonly Meeting[]
  readonly onRefresh: () => void
}

// ── Past Tab ────────────────────────────────────────

export function PastTab({ meetings, onRefresh }: PastTabProps): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Client-side search filter (server also filters, this is for instant feedback)
  const filtered = search.trim()
    ? meetings.filter((m) =>
        m.title.toLowerCase().includes(search.toLowerCase()) ||
        (m.summary ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : meetings

  if (meetings.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <div className="text-lg mb-2">No past meetings</div>
        <div className="text-sm mb-4">
          Completed meetings with summaries and action items will appear here.
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm">Refresh</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search past meetings..."
          className="flex-1 bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <span className="text-sm text-muted-foreground">
          {filtered.length} meeting{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <div className="text-sm">No meetings match your search.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <PastMeetingCard
              key={m.id}
              meeting={m}
              isExpanded={expandedId === m.id}
              onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Past Meeting Card ───────────────────────────────

function PastMeetingCard({
  meeting,
  isExpanded,
  onToggle,
}: {
  meeting: Meeting
  isExpanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const parsed = parseMeeting(meeting)
  const duration = durationMinutes(meeting.start_at, meeting.end_at)
  const startDate = new Date(meeting.start_at)

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-5 text-left flex items-start justify-between gap-3 hover:bg-secondary/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-foreground truncate">{meeting.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span>{startDate.toLocaleDateString()}</span>
            <span>{formatDuration(duration)}</span>
            <span>{parsed.participants.length} attendee{parsed.participants.length !== 1 ? 's' : ''}</span>
          </div>
          {meeting.summary && !isExpanded && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {meeting.summary}
            </p>
          )}
        </div>
        <ChevronIcon isOpen={isExpanded} />
      </button>

      {isExpanded && (
        <ExpandedDetails meeting={parsed} />
      )}
    </div>
  )
}

// ── Expanded Details ────────────────────────────────

function ExpandedDetails({
  meeting,
}: {
  meeting: ReturnType<typeof parseMeeting>
}): React.JSX.Element {
  return (
    <div className="px-5 pb-5 border-t border-border/50 space-y-4">
      {/* Participants */}
      {meeting.participants.length > 0 && (
        <div className="pt-3">
          <div className="text-xs font-medium text-foreground mb-1.5">Attendees</div>
          <div className="flex flex-wrap gap-1.5">
            {meeting.participants.map((p) => (
              <span
                key={p}
                className="px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {meeting.summary && (
        <div>
          <div className="text-xs font-medium text-foreground mb-1.5">Summary</div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {meeting.summary}
          </p>
        </div>
      )}

      {/* Key Decisions */}
      {meeting.key_decisions.length > 0 && (
        <div>
          <div className="text-xs font-medium text-foreground mb-1.5">
            Key Decisions
          </div>
          <ul className="space-y-1">
            {meeting.key_decisions.map((decision, index) => (
              <li
                key={index}
                className="text-sm text-muted-foreground flex items-start gap-2"
              >
                <span className="text-green-500 mt-0.5 shrink-0">-</span>
                <span>{decision}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No summary/decisions yet */}
      {!meeting.summary && meeting.key_decisions.length === 0 && (
        <div className="pt-3 text-sm text-muted-foreground italic">
          No summary or transcript available for this meeting yet.
        </div>
      )}
    </div>
  )
}

// ── Chevron Icon ────────────────────────────────────

function ChevronIcon({ isOpen }: { isOpen: boolean }): React.JSX.Element {
  return (
    <svg
      className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 mt-1 ${
        isOpen ? 'rotate-180' : ''
      }`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <polyline points="4,6 8,10 12,6" />
    </svg>
  )
}
