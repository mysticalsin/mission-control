'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import type { CalendarEvent } from './types'
import { formatTime, formatDate, SOURCE_BADGES } from './helpers'

// ── Event Card ───────────────────────────────────────

function EventCard({
  event,
}: {
  readonly event: CalendarEvent
}): React.JSX.Element {
  const badge = SOURCE_BADGES[event.source] ?? {
    label: event.source,
    className: 'bg-zinc-500/20 text-zinc-400',
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: event.color || '#2DD4BF' }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground truncate">
            {event.title}
          </span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span>{formatDate(event.start_time)}</span>
          {event.all_day ? (
            <span>All day</span>
          ) : (
            <span>
              {formatTime(event.start_time)}
              {event.end_time ? ` - ${formatTime(event.end_time)}` : ''}
            </span>
          )}
          {event.location && <span>{event.location}</span>}
        </div>
        {event.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {event.description}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Empty State ──────────────────────────────────────

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground text-4xl mb-4">--</div>
      <p className="text-muted-foreground">No upcoming events found</p>
    </div>
  )
}

// ── Calendar View Tab ────────────────────────────────

export function CalendarViewTab({
  events,
  onRefresh,
}: {
  readonly events: readonly CalendarEvent[]
  readonly onRefresh: () => void
}): React.JSX.Element {
  if (events.length === 0) {
    return <EmptyState />
  }

  // Group events by date — immutable accumulation
  const grouped = events.reduce<Record<string, CalendarEvent[]>>(
    (acc, event) => {
      const dateKey = event.start_time
        ? event.start_time.slice(0, 10)
        : 'unknown'
      return { ...acc, [dateKey]: [...(acc[dateKey] ?? []), event] }
    },
    {},
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </p>
        <Button onClick={onRefresh} variant="ghost" size="sm">
          Refresh
        </Button>
      </div>
      {Object.entries(grouped).map(([date, dayEvents]) => (
        <div key={date}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            {formatDate(`${date}T00:00:00`)}
          </h3>
          <div className="space-y-2">
            {dayEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
