'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import type { MarketingCampaign } from './marketing-types'
import {
  CAMPAIGN_STATUS_COLORS, CAMPAIGN_TYPE_COLORS, formatCurrency,
  formatUnixDate,
} from './marketing-types'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('MarketingCampaigns')

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CampaignsTabProps {
  readonly onRefresh?: () => void
}

export function CampaignsTab({ onRefresh }: CampaignsTabProps): React.JSX.Element {
  const [campaigns, setCampaigns] = useState<readonly MarketingCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const loadCampaigns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/marketing?tab=campaigns')
      if (!res.ok) throw new Error('Failed to load campaigns')
      const data = await res.json()
      setCampaigns(data.campaigns ?? [])
      log.debug(`Loaded ${(data.campaigns ?? []).length} campaigns`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load campaigns'
      log.error('Failed to load campaigns:', err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  const handleRefresh = useCallback(async () => {
    await loadCampaigns()
    onRefresh?.()
  }, [loadCampaigns, onRefresh])

  const handleCreate = useCallback(async (name: string, type: string, budget: number) => {
    try {
      const res = await fetch('/api/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_campaign', name, type, budget }),
      })
      if (!res.ok) throw new Error('Failed to create campaign')
      log.debug('Campaign created successfully')
      setShowCreate(false)
      await loadCampaigns()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create campaign'
      log.error('Failed to create campaign:', err)
      setError(message)
    }
  }, [loadCampaigns])

  if (loading) {
    return <Loader variant="panel" label="Loading campaigns" />
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        {error}
        <Button onClick={handleRefresh} variant="outline" size="sm" className="ml-3">Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>Refresh</Button>
          <Button size="sm" onClick={() => setShowCreate((prev) => !prev)}>
            {showCreate ? 'Cancel' : 'New Campaign'}
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && <CreateCampaignForm onCreate={handleCreate} />}

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <p className="text-lg mb-2">No campaigns</p>
          <p className="text-sm">Create your first marketing campaign to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Campaign card
// ---------------------------------------------------------------------------

function CampaignCard({ campaign }: { readonly campaign: MarketingCampaign }): React.JSX.Element {
  const budgetUsed = campaign.budget > 0
    ? Math.min((campaign.spent / campaign.budget) * 100, 100)
    : 0

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-foreground truncate">{campaign.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-block rounded-full px-2 py-0.5 text-2xs font-medium ${CAMPAIGN_TYPE_COLORS[campaign.type] ?? ''}`}>
              {campaign.type}
            </span>
            <span className={`inline-block rounded-full border px-2 py-0.5 text-2xs font-medium ${CAMPAIGN_STATUS_COLORS[campaign.status] ?? ''}`}>
              {campaign.status}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-foreground">{formatCurrency(campaign.spent)}</div>
          <div className="text-2xs text-muted-foreground">of {formatCurrency(campaign.budget)}</div>
        </div>
      </div>

      {/* Budget progress bar */}
      {campaign.budget > 0 && (
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all ${budgetUsed > 90 ? 'bg-rose-500' : budgetUsed > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${budgetUsed}%` }}
          />
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 text-xs text-muted-foreground border-t border-border/50 pt-3">
        <div>
          <span className="font-medium text-foreground">{campaign.leads_generated}</span> leads
        </div>
        <div>
          <span className="font-medium text-foreground">{campaign.conversion_rate.toFixed(1)}%</span> conv.
        </div>
        <div>{campaign.start_date || '-'}</div>
        <div className="text-right">{formatUnixDate(campaign.created_at)}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create campaign form
// ---------------------------------------------------------------------------

function CreateCampaignForm({
  onCreate,
}: {
  readonly onCreate: (name: string, type: string, budget: number) => Promise<void>
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState('email')
  const [budget, setBudget] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await onCreate(name.trim(), type, Number(budget) || 0)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-medium text-foreground">Create Campaign</h4>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_150px_auto] gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Campaign name"
          className="h-9 rounded-md border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 rounded-md border border-border bg-secondary/50 px-2 text-xs text-foreground"
        >
          <option value="email">Email</option>
          <option value="social">Social</option>
          <option value="content">Content</option>
          <option value="event">Event</option>
        </select>
        <input
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="Budget ($)"
          type="number"
          min="0"
          className="h-9 rounded-md border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <Button size="sm" onClick={handleSubmit} disabled={submitting || !name.trim()}>
          {submitting ? 'Creating...' : 'Create'}
        </Button>
      </div>
    </div>
  )
}
