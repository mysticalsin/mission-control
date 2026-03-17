'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import type { CalendarConnection, SyncResult } from './types'
import { relativeTime, PROVIDER_COLORS } from './helpers'

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground text-4xl mb-4">--</div>
      <p className="text-muted-foreground">
        No calendar connections configured. Add an account first.
      </p>
    </div>
  )
}

export function SyncStatusTab({
  connections,
  onSync,
  isSyncing,
  syncResult,
}: {
  readonly connections: readonly CalendarConnection[]
  readonly onSync: (connId: string, provider: string) => void
  readonly isSyncing: boolean
  readonly syncResult: SyncResult | null
}): React.JSX.Element {
  if (connections.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-4">
      {syncResult && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-sm text-green-400">
          Synced {syncResult.events_synced} events successfully
        </div>
      )}
      {connections.map((conn) => (
        <div
          key={conn.id}
          className={`p-4 rounded-lg bg-muted/30 border-l-2 ${
            PROVIDER_COLORS[conn.provider] ?? 'border-zinc-500'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">{conn.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {conn.provider.charAt(0).toUpperCase() +
                  conn.provider.slice(1)}{' '}
                -- Last synced: {relativeTime(conn.last_sync)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  conn.status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : conn.status === 'configured'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-zinc-500/20 text-zinc-400'
                }`}
              >
                {conn.status}
              </span>
              <Button
                onClick={() => onSync(conn.id, conn.provider)}
                variant="outline"
                size="sm"
                disabled={isSyncing}
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
