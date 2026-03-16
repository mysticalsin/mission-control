'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('SalesAssistant')

// ── Types ────────────────────────────────────────────────────────────────────

type DealStage = 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost'
type RiskLevel = 'low' | 'medium' | 'high'
type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'demo' | 'proposal'
type BriefingType = 'daily' | 'weekly' | 'deal_specific'
type Tab = 'pipeline' | 'deals' | 'activities' | 'briefings'

interface Deal {
  readonly id: number; readonly company: string; readonly contact_name: string
  readonly contact_email: string; readonly deal_value: number; readonly stage: DealStage
  readonly probability: number; readonly next_action: string; readonly next_action_date: string | null
  readonly risk_level: RiskLevel; readonly notes: string
}
interface PipelineStage { readonly stage: DealStage; readonly count: number; readonly total_value: number }
interface Activity {
  readonly id: number; readonly deal_id: number; readonly activity_type: ActivityType
  readonly description: string; readonly outcome: string; readonly created_at: number; readonly company: string
}
interface Briefing {
  readonly id: number; readonly title: string; readonly content: string
  readonly briefing_type: BriefingType; readonly created_at: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INPUT = 'px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

const STAGE_META: Record<DealStage, { label: string; color: string; bar: string }> = {
  prospecting:   { label: 'Prospecting',   color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',   bar: 'bg-slate-500' },
  qualification: { label: 'Qualification', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',     bar: 'bg-blue-500' },
  proposal:      { label: 'Proposal',      color: 'bg-violet-500/20 text-violet-400 border-violet-500/30', bar: 'bg-violet-500' },
  negotiation:   { label: 'Negotiation',   color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',  bar: 'bg-amber-500' },
  closed_won:    { label: 'Closed Won',    color: 'bg-green-500/20 text-green-400 border-green-500/30',  bar: 'bg-green-500' },
  closed_lost:   { label: 'Closed Lost',   color: 'bg-red-500/20 text-red-400 border-red-500/30',        bar: 'bg-red-500' },
}
const RISK_BADGE: Record<RiskLevel, string> = {
  low:    'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  high:   'bg-red-500/20 text-red-400 border-red-500/30',
}
const ACTIVITY_ICON: Record<ActivityType, string> = {
  call: '📞', email: '✉️', meeting: '🤝', note: '📝', demo: '🖥️', proposal: '📄',
}
const BRIEFING_BADGE: Record<BriefingType, string> = {
  daily:        'bg-blue-500/20 text-blue-400 border-blue-500/30',
  weekly:       'bg-violet-500/20 text-violet-400 border-violet-500/30',
  deal_specific:'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

// ── Micro components ──────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }): React.JSX.Element {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>
}
function Empty({ msg }: { msg: string }): React.JSX.Element {
  return <div className="text-center py-12 text-muted-foreground text-sm">{msg}</div>
}
function fmt(value: number): string {
  return value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000 ? `$${(value / 1_000).toFixed(0)}k` : `$${value.toFixed(0)}`
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SalesAssistantPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('pipeline')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pipeline, setPipeline] = useState<PipelineStage[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [deals, setDeals] = useState<Deal[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [briefings, setBriefings] = useState<Briefing[]>([])

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sales-assistant?tab=${tab}`)
      if (!res.ok) throw new Error(`Failed to load ${tab}`)
      const data = await res.json()
      if (tab === 'pipeline') { setPipeline(data.pipeline ?? []); setTotalValue(data.totalValue ?? 0) }
      else if (tab === 'deals') setDeals(data.deals ?? [])
      else if (tab === 'activities') setActivities(data.activities ?? [])
      else if (tab === 'briefings') setBriefings(data.briefings ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Sales data load failed:', err)
      setError(message)
    } finally { setIsLoading(false) }
  }, [tab])

  useEffect(() => { loadData() }, [loadData])

  const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: 'pipeline', label: 'Pipeline' }, { key: 'deals', label: 'Deals' },
    { key: 'activities', label: 'Activities' }, { key: 'briefings', label: 'Briefings' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Sales Assistant</h1>
            <p className="text-muted-foreground mt-1">AI-powered sales intelligence and deal management</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
            <Button onClick={loadData} variant="outline" size="sm">Refresh</Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="text-center py-12">
          <div className="text-lg text-red-400 mb-2">Failed to load data</div>
          <div className="text-sm text-muted-foreground mb-4">{error}</div>
          <Button onClick={loadData} variant="outline" size="sm">Retry</Button>
        </div>
      ) : isLoading ? (
        <Loader variant="panel" label="Loading sales data" />
      ) : tab === 'pipeline' ? (
        <PipelineTab pipeline={pipeline} totalValue={totalValue} />
      ) : tab === 'deals' ? (
        <DealsTab deals={deals} onRefresh={loadData} />
      ) : tab === 'activities' ? (
        <ActivitiesTab activities={activities} deals={deals} onRefresh={loadData} />
      ) : (
        <BriefingsTab briefings={briefings} onRefresh={loadData} />
      )}
    </div>
  )
}

// ── Pipeline tab ──────────────────────────────────────────────────────────────

function PipelineTab({ pipeline, totalValue }: { pipeline: PipelineStage[]; totalValue: number }): React.JSX.Element {
  const activeStages = pipeline.filter(s => s.stage !== 'closed_lost')
  const maxCount = Math.max(...activeStages.map(s => s.count), 1)

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Pipeline Value</div>
        <div className="text-2xl font-bold text-foreground">{fmt(totalValue)}</div>
      </div>

      {pipeline.length === 0 ? <Empty msg="No deals in pipeline yet" /> : (
        <div className="space-y-3">
          {pipeline.map(({ stage, count, total_value }) => {
            const meta = STAGE_META[stage]
            const widthPct = stage === 'closed_lost' ? 0 : (count / maxCount) * 100
            return (
              <div key={stage} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge label={meta.label} cls={meta.color} />
                    <span className="text-sm text-muted-foreground">{count} deal{count !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{fmt(total_value)}</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full ${meta.bar} rounded-full transition-all`} style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Deals tab ─────────────────────────────────────────────────────────────────

function DealsTab({ deals, onRefresh }: { deals: Deal[]; onRefresh: () => void }): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ company: '', contact_name: '', contact_email: '', deal_value: '0', stage: 'prospecting' as DealStage, probability: '10', risk_level: 'low' as RiskLevel, next_action: '' })

  const handleCreate = async (): Promise<void> => {
    if (!form.company.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/sales-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_deal', ...form, deal_value: Number(form.deal_value), probability: Number(form.probability) }),
      })
      if (!res.ok) throw new Error('Failed to create deal')
      setForm({ company: '', contact_name: '', contact_email: '', deal_value: '0', stage: 'prospecting', probability: '10', risk_level: 'low', next_action: '' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create deal failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New Deal'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Deal</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Company *" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            <input className={INPUT} placeholder="Contact name" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
            <input className={INPUT} placeholder="Contact email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
            <input className={INPUT} type="number" min={0} placeholder="Deal value ($)" value={form.deal_value} onChange={e => setForm({ ...form, deal_value: e.target.value })} />
            <select className={INPUT} value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value as DealStage })}>
              {(Object.keys(STAGE_META) as DealStage[]).map(s => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
            </select>
            <select className={INPUT} value={form.risk_level} onChange={e => setForm({ ...form, risk_level: e.target.value as RiskLevel })}>
              {(['low','medium','high'] as RiskLevel[]).map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)} Risk</option>)}
            </select>
            <input className={INPUT} placeholder="Next action" value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })} />
            <input className={INPUT} type="number" min={0} max={100} placeholder="Probability %" value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={busy || !form.company.trim()}>{busy ? 'Saving…' : 'Create Deal'}</Button>
        </div>
      )}
      {deals.length === 0 ? <Empty msg="No deals yet" /> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr>{['Company','Contact','Value','Stage','Prob.','Risk','Next Action'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deals.map(deal => (
                <tr key={deal.id} className="bg-card hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-2 font-medium text-foreground">{deal.company}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{deal.contact_name || '—'}</td>
                  <td className="px-4 py-2 text-foreground font-mono text-xs">{fmt(deal.deal_value)}</td>
                  <td className="px-4 py-2"><Badge label={STAGE_META[deal.stage].label} cls={STAGE_META[deal.stage].color} /></td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{deal.probability}%</td>
                  <td className="px-4 py-2"><Badge label={deal.risk_level} cls={RISK_BADGE[deal.risk_level]} /></td>
                  <td className="px-4 py-2 text-muted-foreground text-xs max-w-[180px] truncate">{deal.next_action || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Activities tab ────────────────────────────────────────────────────────────

function ActivitiesTab({ activities, deals, onRefresh }: { activities: Activity[]; deals: Deal[]; onRefresh: () => void }): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ deal_id: '', activity_type: 'call' as ActivityType, description: '', outcome: '' })

  const handleLog = async (): Promise<void> => {
    if (!form.deal_id) return
    setBusy(true)
    try {
      const res = await fetch('/api/sales-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log_activity', deal_id: Number(form.deal_id), activity_type: form.activity_type, description: form.description, outcome: form.outcome }),
      })
      if (!res.ok) throw new Error('Failed to log activity')
      setForm({ deal_id: '', activity_type: 'call', description: '', outcome: '' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Log activity failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Log Activity'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">Log Activity</div>
          <div className="grid grid-cols-2 gap-3">
            <select className={INPUT} value={form.deal_id} onChange={e => setForm({ ...form, deal_id: e.target.value })}>
              <option value="">Select deal *</option>
              {deals.map(d => <option key={d.id} value={d.id}>{d.company}</option>)}
            </select>
            <select className={INPUT} value={form.activity_type} onChange={e => setForm({ ...form, activity_type: e.target.value as ActivityType })}>
              {(['call','email','meeting','note','demo','proposal'] as ActivityType[]).map(t => <option key={t} value={t}>{ACTIVITY_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <textarea className={`${INPUT} col-span-2 resize-none`} rows={2} placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <textarea className={`${INPUT} col-span-2 resize-none`} rows={2} placeholder="Outcome" value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleLog} disabled={busy || !form.deal_id}>{busy ? 'Saving…' : 'Log Activity'}</Button>
        </div>
      )}
      {activities.length === 0 ? <Empty msg="No activities logged yet" /> : (
        <div className="space-y-2">
          {activities.map(a => (
            <div key={a.id} className="flex gap-3 rounded-lg border border-border bg-card p-3">
              <span className="text-xl shrink-0 mt-0.5">{ACTIVITY_ICON[a.activity_type]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{a.company || `Deal #${a.deal_id}`}</span>
                  <Badge label={a.activity_type} cls="bg-secondary text-muted-foreground border-border" />
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(a.created_at * 1000).toLocaleDateString()}</span>
                </div>
                {a.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                {a.outcome && <p className="text-xs text-green-400 mt-1 line-clamp-1">→ {a.outcome}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Briefings tab ─────────────────────────────────────────────────────────────

function BriefingsTab({ briefings, onRefresh }: { briefings: Briefing[]; onRefresh: () => void }): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', briefing_type: 'daily' as BriefingType })

  const handleCreate = async (): Promise<void> => {
    if (!form.title.trim() || !form.content.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/sales-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_briefing', title: form.title, content: form.content, briefing_type: form.briefing_type }),
      })
      if (!res.ok) throw new Error('Failed to create briefing')
      setForm({ title: '', content: '', briefing_type: 'daily' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create briefing failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New Briefing'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Briefing</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <select className={INPUT} value={form.briefing_type} onChange={e => setForm({ ...form, briefing_type: e.target.value as BriefingType })}>
              {(['daily','weekly','deal_specific'] as BriefingType[]).map(t => <option key={t} value={t}>{t.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
            <textarea className={`${INPUT} col-span-2 resize-none`} rows={4} placeholder="Briefing content *" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={busy || !form.title.trim() || !form.content.trim()}>{busy ? 'Saving…' : 'Save Briefing'}</Button>
        </div>
      )}
      {briefings.length === 0 ? <Empty msg="No briefings yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {briefings.map(b => (
            <div key={b.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground leading-snug">{b.title}</span>
                <Badge label={b.briefing_type.replace('_',' ')} cls={BRIEFING_BADGE[b.briefing_type]} />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{b.content}</p>
              <div className="text-xs text-muted-foreground">{new Date(b.created_at * 1000).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
