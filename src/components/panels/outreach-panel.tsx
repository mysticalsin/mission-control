'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('Outreach')

// ── Types ────────────────────────────────────────────────────────────────────

type CampaignType = 'email' | 'linkedin' | 'call' | 'multi'
type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'
type ContactStatus = 'pending' | 'contacted' | 'replied' | 'meeting' | 'converted' | 'rejected'
type TemplateChannel = 'email' | 'linkedin' | 'call'
type Tab = 'campaigns' | 'contacts' | 'templates'

interface Campaign {
  readonly id: number; readonly name: string; readonly type: CampaignType
  readonly status: CampaignStatus; readonly total_contacts: number
  readonly contacted: number; readonly replied: number; readonly meetings_booked: number
}
interface Contact {
  readonly id: number; readonly campaign_id: number; readonly name: string
  readonly email: string; readonly company: string; readonly title: string
  readonly status: ContactStatus; readonly notes: string
}
interface Template {
  readonly id: number; readonly name: string; readonly channel: TemplateChannel
  readonly subject: string; readonly body: string; readonly usage_count: number
}

// ── Shared constants ─────────────────────────────────────────────────────────

const INPUT = 'px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

const CAMPAIGN_BADGE: Record<CampaignStatus, string> = {
  draft: 'bg-secondary text-muted-foreground border-border',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

const CONTACT_BADGE: Record<ContactStatus, string> = {
  pending: 'bg-secondary text-muted-foreground border-border',
  contacted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  replied: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  meeting: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  converted: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const CHANNEL_ICON: Record<TemplateChannel, string> = {
  email: '✉', linkedin: 'in', call: '☏',
}

// ── Micro components ─────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }): React.JSX.Element {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>
}

function Empty({ msg }: { msg: string }): React.JSX.Element {
  return <div className="text-center py-12 text-muted-foreground text-sm">{msg}</div>
}

// ── Main component ───────────────────────────────────────────────────────────

export function OutreachPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('campaigns')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [templates, setTemplates] = useState<Template[]>([])

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/outreach?tab=${tab}`)
      if (!res.ok) throw new Error(`Failed to load ${tab}`)
      const data = await res.json()
      if (tab === 'campaigns') setCampaigns(data.campaigns ?? [])
      else if (tab === 'contacts') setContacts(data.contacts ?? [])
      else setTemplates(data.templates ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Outreach data load failed:', err)
      setError(message)
    } finally { setIsLoading(false) }
  }, [tab])

  useEffect(() => { loadData() }, [loadData])

  const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: 'campaigns', label: 'Campaigns' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'templates', label: 'Templates' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Outreach Pipeline</h1>
            <p className="text-muted-foreground mt-1">
              Sales outreach campaigns, contact tracking, and message templates
            </p>
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
        <Loader variant="panel" label="Loading outreach data" />
      ) : tab === 'campaigns' ? (
        <CampaignsTab campaigns={campaigns} onRefresh={loadData} />
      ) : tab === 'contacts' ? (
        <ContactsTab contacts={contacts} campaigns={campaigns} onRefresh={loadData} />
      ) : (
        <TemplatesTab templates={templates} onRefresh={loadData} />
      )}
    </div>
  )
}

// ── Campaigns tab ─────────────────────────────────────────────────────────────

function CampaignsTab({ campaigns, onRefresh }: { campaigns: Campaign[]; onRefresh: () => void }): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'email' as CampaignType })

  const handleCreate = async (): Promise<void> => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_campaign', name: form.name, type: form.type }),
      })
      if (!res.ok) throw new Error('Failed to create campaign')
      setForm({ name: '', type: 'email' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create campaign failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New Campaign'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Campaign</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Campaign name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <select className={INPUT} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as CampaignType })}>
              {(['email', 'linkedin', 'call', 'multi'] as CampaignType[]).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <Button size="sm" onClick={handleCreate} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Create Campaign'}</Button>
        </div>
      )}
      {campaigns.length === 0 ? <Empty msg="No campaigns yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map(c => <CampaignCard key={c.id} campaign={c} />)}
        </div>
      )}
    </div>
  )
}

function CampaignCard({ campaign: c }: { campaign: Campaign }): React.JSX.Element {
  // Reply rate gives a quick signal on messaging quality
  const replyRate = c.contacted > 0 ? Math.round((c.replied / c.contacted) * 100) : 0
  const progress = c.total_contacts > 0 ? Math.round((c.contacted / c.total_contacts) * 100) : 0

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{c.name}</span>
        <Badge label={c.status} cls={CAMPAIGN_BADGE[c.status]} />
      </div>
      <Badge label={c.type} cls="bg-secondary text-muted-foreground border-border" />
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{c.contacted} / {c.total_contacts} contacted</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{c.replied} replied</span>
        <span>{replyRate}% reply rate</span>
        <span>{c.meetings_booked} meetings</span>
      </div>
    </div>
  )
}

// ── Contacts tab ──────────────────────────────────────────────────────────────

function ContactsTab({ contacts, campaigns, onRefresh }: { contacts: Contact[]; campaigns: Campaign[]; onRefresh: () => void }): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ campaign_id: '', name: '', email: '', company: '', title: '' })

  const filtered = search
    ? contacts.filter(c => [c.name, c.company, c.email].some(v => v.toLowerCase().includes(search.toLowerCase())))
    : contacts

  const handleAdd = async (): Promise<void> => {
    if (!form.name.trim() || !form.campaign_id) return
    setBusy(true)
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_contact', campaign_id: Number(form.campaign_id), name: form.name, email: form.email, company: form.company, title: form.title }),
      })
      if (!res.ok) throw new Error('Failed to add contact')
      setForm({ campaign_id: '', name: '', email: '', company: '', title: '' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Add contact failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input type="text" placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} className={`${INPUT} flex-1 max-w-xs`} />
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Contact'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">Add Contact</div>
          <div className="grid grid-cols-2 gap-3">
            <select className={INPUT} value={form.campaign_id} onChange={e => setForm({ ...form, campaign_id: e.target.value })}>
              <option value="">Select campaign *</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className={INPUT} placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={INPUT} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className={INPUT} placeholder="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            <input className={INPUT} placeholder="Title / Role" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={busy || !form.name.trim() || !form.campaign_id}>{busy ? 'Saving…' : 'Add Contact'}</Button>
        </div>
      )}
      {filtered.length === 0 ? <Empty msg="No contacts yet" /> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr>{['Name', 'Company', 'Title', 'Email', 'Status'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(contact => (
                <tr key={contact.id} className="bg-card hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-2 font-medium text-foreground">{contact.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{contact.company || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{contact.title || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{contact.email || '—'}</td>
                  <td className="px-4 py-2"><Badge label={contact.status} cls={CONTACT_BADGE[contact.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Templates tab ─────────────────────────────────────────────────────────────

function TemplatesTab({ templates, onRefresh }: { templates: Template[]; onRefresh: () => void }): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', channel: 'email' as TemplateChannel, subject: '', body: '' })

  const handleCreate = async (): Promise<void> => {
    if (!form.name.trim() || !form.body.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_template', name: form.name, channel: form.channel, subject: form.subject, body: form.body }),
      })
      if (!res.ok) throw new Error('Failed to create template')
      setForm({ name: '', channel: 'email', subject: '', body: '' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Create template failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ New Template'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Template</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Template name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <select className={INPUT} value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as TemplateChannel })}>
              {(['email', 'linkedin', 'call'] as TemplateChannel[]).map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </select>
            {form.channel === 'email' && (
              <input className={`${INPUT} col-span-2`} placeholder="Subject line" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            )}
            <textarea className={`${INPUT} col-span-2 resize-none`} rows={4} placeholder="Message body * (use {{variable}} for placeholders)" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={busy || !form.name.trim() || !form.body.trim()}>{busy ? 'Saving…' : 'Save Template'}</Button>
        </div>
      )}
      {templates.length === 0 ? <Empty msg="No templates yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{t.name}</span>
                <span className="flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                  {CHANNEL_ICON[t.channel]} {t.channel}
                </span>
              </div>
              {t.subject && <p className="text-xs text-muted-foreground font-medium truncate">{t.subject}</p>}
              <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{t.body}</p>
              <div className="text-xs text-muted-foreground">{t.usage_count} uses</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
