'use client'

import React from 'react'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Reusable UI primitives for Omega tabs
// ---------------------------------------------------------------------------

export function StatCard({
  label,
  value,
  accent,
}: {
  readonly label: string
  readonly value: string
  readonly accent?: string
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold ${accent ?? 'text-foreground'}`}>{value}</span>
    </div>
  )
}

export function StatusBadge({ status }: { readonly status: string }): React.JSX.Element {
  const colorMap: Readonly<Record<string, string>> = {
    success: 'bg-green-400/20 text-green-400',
    failure: 'bg-red-400/20 text-red-400',
    denied: 'bg-red-400/20 text-red-400',
    pending: 'bg-yellow-400/20 text-yellow-400',
    skipped: 'bg-muted text-muted-foreground',
  }
  const classes = colorMap[status] ?? 'bg-muted text-muted-foreground'

  return (
    <span className={`px-1.5 py-0.5 rounded text-2xs font-mono ${classes}`}>
      {status}
    </span>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string
  readonly onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <p className="text-sm text-red-400">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

export function EmptyState({ message }: { readonly message: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-center py-8">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
