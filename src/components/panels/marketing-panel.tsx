'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('Marketing')

// ── Types ────────────────────────────────────────────────────────────────────

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted'
type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'
type CampaignType = 'email' | 'social' | 'content' | 'event'
type PresentationStatus = 'generating' | 'ready' | 'archived'
type Tab = 'leads' | 'signals' | 'campaigns' | 'presentations'

interface Lead { readonly id: number; readonly name: string; readonly company: string; readonly email: string; readonly status: LeadStatus; readonly source: string; readonly score: number }
interface Signal { readonly id: number; readonly signal_type: string; readonly company: string; readonly description: string; readonly confidence: number; readonly source_url: string }
interface Campaign { readonly id: number; readonly name: string; readonly type: CampaignType; readonly status: CampaignStatus; readonly budget: number; readonly spent: number; readonly leads_generated: number; readonly conversion_rate: number }
interface Presentation { readonly id: number; readonly title: string; readonly topic: string; readonly slide_count: number; readonly status: PresentationStatus }
interface FunnelData { readonly new: number; readonly contacted: number; readonly qualified: number; readonly converted: number }

// ── Shared constants ─────────────────────────────────────────────────────────

const INPUT = 'px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

const LEAD_BADGE: Record<LeadStatus, string> = {
  new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  contacted: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  qualified: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  converted: 'bg-green-500/20 text-green-400 border-green-500/30',
}
const CAMPAIGN_BADGE: Record<CampaignStatus, string> = {
  draft: 'bg-secondary text-muted-foreground border-border',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}
const PRESENTATION_BADGE: Record<PresentationStatus, string> = {
  generating: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  ready: 'bg-green-500/20 text-green-400 border-green-500/30',
  archived: 'bg-secondary text-muted-foreground border-border',
}

// ── Micro components ─────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }): React.JSX.Element {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>
}
function Empty({ msg }: { msg: string }): React.JSX.Element {
  return <div className="text-center py-12 text-muted-foreground text-sm">{msg}</div>
}

// ── Main component ───────────────────────────────────────────────────────────

export function MarketingPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('leads')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [presentations, setPresentations] = useState<Presentation[]>([])
  const [funnel, setFunnel] = useState<FunnelData | null>(null)

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing?tab=${tab}`)
      if (!res.ok) throw new Error(`Failed to load ${tab}`)
      const data = await res.json()
      if (tab === 'leads') {
        setLeads(data.leads ?? [])
        fetch('/api/marketing?tab=funnel').then(r => r.json()).then(d => setFunnel(d.funnel ?? null)).catch(() => null)
      } else if (tab === 'signals') { setSignals(data.signals ?? [])
      } else if (tab === 'campaigns') { setCampaigns(data.campaigns ?? [])
      } else if (tab === 'presentations') { setPresentations(data.presentations ?? []) }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Marketing data load failed:', err)
      setError(message)
    } finally { setIsLoading(false) }
  }, [tab])

  useEffect(() => { loadData() }, [loadData])

  const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: 'leads', label: 'Leads' }, { key: 'signals', label: 'Signals' },
    { key: 'campaigns', label: 'Campaigns' }, { key: 'presentations', label: 'Presentations' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Marketing Studio</h1>
            <p className="text-muted-foreground mt-1">Lead generation, signals, campaigns, and presentations</p>
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
        <Loader variant="panel" label="Loading marketing data" />
      ) : tab === 'leads' ? (
        <LeadsTab leads={leads} funnel={funnel} onRefresh={loadData} />
      ) : tab === 'signals' ? (
        <SignalsTab signals={signals} />
      ) : tab === 'campaigns' ? (
        <CampaignsTab campaigns={campaigns} onRefresh={loadData} />
      ) : (
        <PresentationsTab presentations={presentations} onRefresh={loadData} />
      )}
    </div>
  )
}

// ── Leads tab ────────────────────────────────────────────────────────────────

function LeadsTab({ leads, funnel, onRefresh }: { leads: Lead[]; funnel: FunnelData | null; onRefresh: () => void }): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', email: '', source: '', score: '0' })

  const filtered = search ? leads.filter(l => [l.name, l.company, l.email].some(v => v.toLowerCase().includes(search.toLowerCase()))) : leads

  const handleAdd = async (): Promise<void> => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_lead', name: form.name, company: form.company, email: form.email, source: form.source, score: Number(form.score) }) })
      if (!res.ok) throw new Error('Failed to create lead')
      setForm({ name: '', company: '', email: '', source: '', score: '0' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create lead failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {funnel && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Funnel Overview</div>
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {([['new','bg-blue-500'],['contacted','bg-amber-500'],['qualified','bg-purple-500'],['converted','bg-green-500']] as const).map(([k,c]) => {
              const total = (funnel.new + funnel.contacted + funnel.qualified + funnel.converted) || 1
              return <div key={k} className={`${c} transition-all`} style={{ width: `${(funnel[k] / total) * 100}%` }} />
            })}
          </div>
          <div className="flex gap-4 flex-wrap">
            {([['new','bg-blue-500','New'],['contacted','bg-amber-500','Contacted'],['qualified','bg-purple-500','Qualified'],['converted','bg-green-500','Converted']] as const).map(([k,c,l]) => (
              <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${c}`} /><span>{l}:</span><span className="font-medium text-foreground">{funnel[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <input type="text" placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} className={`${INPUT} flex-1 max-w-xs`} />
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Lead'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Lead</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={INPUT} placeholder="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            <input className={INPUT} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className={INPUT} placeholder="Source" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} />
            <input className={INPUT} type="number" min={0} max={100} placeholder="Score (0–100)" value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save Lead'}</Button>
        </div>
      )}
      {filtered.length === 0 ? <Empty msg="No leads yet" /> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr>{['Name','Company','Email','Status','Score'].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(lead => (
                <tr key={lead.id} className="bg-card hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-2 font-medium text-foreground">{lead.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{lead.company || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{lead.email || '—'}</td>
                  <td className="px-4 py-2"><Badge label={lead.status} cls={LEAD_BADGE[lead.status]} /></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${lead.score}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{lead.score}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Signals tab ──────────────────────────────────────────────────────────────

function SignalsTab({ signals }: { signals: Signal[] }): React.JSX.Element {
  if (signals.length === 0) return <Empty msg="No signals yet" />
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {signals.map(s => (
        <div key={s.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Badge label={s.signal_type} cls="bg-blue-500/20 text-blue-400 border-blue-500/30" />
            <span className="text-xs text-muted-foreground shrink-0">{s.confidence}% confidence</span>
          </div>
          {s.company && <div className="text-sm font-medium text-foreground">{s.company}</div>}
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{s.description || '—'}</p>
          {s.source_url && <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">{s.source_url}</a>}
        </div>
      ))}
    </div>
  )
}

// ── Campaigns tab ────────────────────────────────────────────────────────────

function CampaignsTab({ campaigns, onRefresh }: { campaigns: Campaign[]; onRefresh: () => void }): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'email' as CampaignType, budget: '0' })

  const handleCreate = async (): Promise<void> => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_campaign', name: form.name, type: form.type, budget: Number(form.budget) }) })
      if (!res.ok) throw new Error('Failed to create campaign')
      setForm({ name: '', type: 'email', budget: '0' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create campaign failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New Campaign'}</Button></div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Campaign</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Campaign name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <select className={INPUT} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as CampaignType })}>
              {(['email','social','content','event'] as CampaignType[]).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className={INPUT} type="number" min={0} placeholder="Budget" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Create Campaign'}</Button>
        </div>
      )}
      {campaigns.length === 0 ? <Empty msg="No campaigns yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map(c => {
            const pct = c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0
            const barColor = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-primary'
            return (
              <div key={c.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  <Badge label={c.status} cls={CAMPAIGN_BADGE[c.status]} />
                </div>
                <Badge label={c.type} cls="bg-secondary text-muted-foreground border-border" />
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Budget: ${c.budget.toLocaleString()}</span><span>Spent: ${c.spent.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{c.leads_generated} leads</span><span>{c.conversion_rate.toFixed(1)}% CVR</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Presentations tab ────────────────────────────────────────────────────────

function PresentationsTab({ presentations, onRefresh }: { presentations: Presentation[]; onRefresh: () => void }): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', topic: '', slide_count: '10' })

  const handleCreate = async (): Promise<void> => {
    if (!form.title.trim() || !form.topic.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_presentation', title: form.title, topic: form.topic, slide_count: Number(form.slide_count) }) })
      if (!res.ok) throw new Error('Failed to create presentation')
      setForm({ title: '', topic: '', slide_count: '10' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create presentation failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New Presentation'}</Button></div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Presentation</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={`${INPUT} w-full`} placeholder="Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <input className={`${INPUT} w-full`} type="number" min={1} max={100} placeholder="Slides" value={form.slide_count} onChange={e => setForm({ ...form, slide_count: e.target.value })} />
            <textarea className={`${INPUT} w-full col-span-2 resize-none`} rows={2} placeholder="Topic / brief *" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={busy || !form.title.trim() || !form.topic.trim()}>{busy ? 'Saving…' : 'Create Presentation'}</Button>
        </div>
      )}
      {presentations.length === 0 ? <Empty msg="No presentations yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {presentations.map(p => (
            <div key={p.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground leading-snug">{p.title}</span>
                <Badge label={p.status} cls={PRESENTATION_BADGE[p.status]} />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{p.topic}</p>
              <div className="text-xs text-muted-foreground">{p.slide_count} slides</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
