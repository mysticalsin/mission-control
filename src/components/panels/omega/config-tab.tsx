'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { ErrorState, EmptyState } from './shared'
import type { TabProps, PolicyItem } from './types'

const log = createClientLogger('Omega:Config')

export function ConfigTab({ isLoading, setIsLoading, error, setError }: TabProps): React.JSX.Element {
  const [policies, setPolicies] = useState<readonly PolicyItem[]>([])
  const [bootstrapResult, setBootstrapResult] = useState<string | null>(null)

  const loadPolicies = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/omega?tab=policies')
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(body.error ?? `Policies request failed (${res.status})`)
      }
      const data = await res.json() as { items: PolicyItem[] }
      setPolicies(data.items ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load policies'
      setError(message)
      log.error('Policies load failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [setIsLoading, setError])

  const handleBootstrap = useCallback(async (): Promise<void> => {
    setBootstrapResult(null)
    try {
      const res = await fetch('/api/omega', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bootstrap_permissions' }),
      })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) {
        throw new Error((data.error as string) ?? 'Bootstrap failed')
      }
      setBootstrapResult(`Bootstrapped: ${JSON.stringify(data.summary ?? data)}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bootstrap failed'
      setBootstrapResult(`Error: ${message}`)
      log.error('Bootstrap failed:', err)
    }
  }, [])

  useEffect(() => { void loadPolicies() }, [loadPolicies])

  if (isLoading) return <Loader label="Loading configuration..." />
  if (error) return <ErrorState message={error} onRetry={loadPolicies} />

  return (
    <div className="flex flex-col gap-4">
      {/* Bootstrap action */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleBootstrap}>
          Bootstrap Permissions
        </Button>
        {bootstrapResult && (
          <span className={`text-xs ${bootstrapResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {bootstrapResult}
          </span>
        )}
      </div>

      {/* Policy list */}
      {policies.length === 0 ? (
        <EmptyState message="No policies configured" />
      ) : (
        <div className="space-y-2">
          {policies.map((policy) => (
            <PolicyCard key={policy.policy_id} policy={policy} />
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={loadPolicies} className="self-end">
        Refresh
      </Button>
    </div>
  )
}

function PolicyCard({ policy }: { readonly policy: PolicyItem }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-foreground">{policy.policy_name}</span>
        <span className="text-xs font-mono text-muted-foreground">{policy.policy_id}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{policy.description}</p>
      <div className="flex flex-wrap gap-1">
        {policy.permissions.map((perm) => (
          <span
            key={perm}
            className="px-1.5 py-0.5 text-2xs rounded bg-primary/10 text-primary font-mono"
          >
            {perm}
          </span>
        ))}
      </div>
    </div>
  )
}
