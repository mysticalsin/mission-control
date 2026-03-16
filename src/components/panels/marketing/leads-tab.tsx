'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { MarketingLead, FunnelData } from './marketing-types'
import {
  LEAD_STATUS_COLORS, formatUnixDate,
} from './marketing-types'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('MarketingLeads')

// ---------------------------------------------------------------------------
// Lead funnel chart data
// ---------------------------------------------------------------------------

const FUNNEL_STAGES = ['new', 'contacted', 'qualified', 'converted'] as const

function buildFunnelChartData(funnel: FunnelData): Array<{ stage: string; count: number }> {
  return FUNNEL_STAGES.map((stage) => ({
    stage: stage.charAt(0).toUpperCase() + stage.slice(1),
    count: funnel[stage],
  }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LeadsTabProps {
  readonly onRefresh?: () => void
}

export function LeadsTab({ onRefresh }: LeadsTabProps): React.JSX.Element {
  const [leads, setLeads] = useState<readonly MarketingLead[]>([])
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  const loadLeads = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ tab: 'leads', sort: 'score', order: sortOrder })
      if (statusFilter) params.set('status', statusFilter)
      if (search.trim()) params.set('search', search.trim())

      const [leadsRes, funnelRes] = await Promise.all([
        fetch(`/api/marketing?${params.toString()}`),
        fetch('/api/marketing?tab=funnel'),
      ])

      if (!leadsRes.ok) throw new Error('Failed to load leads')
      if (!funnelRes.ok) throw new Error('Failed to load funnel data')

      const leadsData = await leadsRes.json()
      const funnelData = await funnelRes.json()

      setLeads(leadsData.leads ?? [])
      setFunnel(funnelData.funnel ?? null)
      log.debug(`Loaded ${(leadsData.leads ?? []).length} leads`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load leads'
      log.error('Failed to load leads:', err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, sortOrder])

  useEffect(() => { loadLeads() }, [loadLeads])

  const handleRefresh = useCallback(async () => {
    await loadLeads()
    onRefresh?.()
  }, [loadLeads, onRefresh])

  if (loading) {
    return <Loader variant="panel" label="Loading leads" />
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        {error}
        <Button onClick={handleRefresh} variant="outline" size="sm" className="ml-3">Retry</Button>
      </div>
    )
  }

  const funnelChartData = funnel ? buildFunnelChartData(funnel) : []

  return (
    <div className="space-y-6">
      {/* Funnel visualization */}
      {funnelChartData.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Lead Funnel</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" name="Leads" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads..."
          className="h-9 w-64 rounded-md border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-secondary/50 px-2 text-xs text-foreground"
        >
          <option value="">All statuses</option>
          {FUNNEL_STAGES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
        >
          Score {sortOrder === 'desc' ? 'High-Low' : 'Low-High'}
        </Button>
        <Button variant="outline" size="sm" onClick={handleRefresh}>Refresh</Button>
      </div>

      {/* Leads table */}
      {leads.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <p className="text-lg mb-2">No leads yet</p>
          <p className="text-sm">Leads will appear here as they are generated or imported.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium text-right">Score</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{lead.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.company || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{lead.email || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-2xs font-medium ${LEAD_STATUS_COLORS[lead.status] ?? ''}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{lead.source || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <ScoreBadge score={lead.score} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatUnixDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score badge with color gradient
// ---------------------------------------------------------------------------

function ScoreBadge({ score }: { readonly score: number }): React.JSX.Element {
  const color =
    score >= 80 ? 'text-emerald-400' :
    score >= 50 ? 'text-amber-400' :
    'text-muted-foreground'

  return <span className={`text-sm font-semibold ${color}`}>{score}</span>
}
