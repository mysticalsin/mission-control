'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import type { CalendarConnection } from './types'
import { formatDate } from './helpers'

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground text-4xl mb-4">--</div>
      <p className="text-muted-foreground">No connected calendar accounts</p>
    </div>
  )
}

export function AccountsTab({
  connections,
  onDelete,
  isDeleting,
}: {
  readonly connections: readonly CalendarConnection[]
  readonly onDelete: (connId: string) => void
  readonly isDeleting: boolean
}): React.JSX.Element {
  if (connections.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {connections.length} connected account
        {connections.length !== 1 ? 's' : ''}
      </p>
      {connections.map((conn) => (
        <div
          key={conn.id}
          className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                conn.provider === 'google'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-purple-500/20 text-purple-400'
              }`}
            >
              {conn.provider === 'google' ? 'G' : 'A'}
            </div>
            <div>
              <p className="font-medium text-foreground">{conn.name}</p>
              <p className="text-xs text-muted-foreground">
                Added {formatDate(conn.created_at)}
              </p>
            </div>
          </div>
          <Button
            onClick={() => onDelete(conn.id)}
            variant="outline"
            size="sm"
            disabled={isDeleting}
            className="text-red-400 border-red-500/30 hover:bg-red-500/10"
          >
            Disconnect
          </Button>
        </div>
      ))}
    </div>
  )
}
