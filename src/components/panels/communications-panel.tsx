'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('CommunicationsHub')

// ── Types ────────────────────────────────────────────────────────────────────

type Platform = 'discord' | 'telegram' | 'whatsapp' | 'slack' | 'email' | 'sms' | 'imessage'
type ChannelStatus = 'active' | 'inactive' | 'error'
type Direction = 'inbound' | 'outbound'
type Tab = 'channels' | 'messages' | 'stats'

interface Channel {
  readonly id: number
  readonly name: string
  readonly platform: Platform
  readonly status: ChannelStatus
  readonly webhook_url: string
  readonly last_message_at: number | null
  readonly message_count: number
  readonly created_at: number
}

interface Message {
  readonly id: number
  readonly channel_id: number
  readonly channel_name: string
  readonly platform: Platform
  readonly direction: Direction
  readonly sender: string
  readonly content: string
  readonly created_at: number
}

interface PlatformStat {
  readonly platform: string
  readonly active_channels: number
  readonly total_messages: number
  readonly last_activity: number | null
}

interface StatsData {
  readonly platformStats: readonly PlatformStat[]
  readonly totals: { total_channels: number; active_count: number; total_messages: number }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INPUT = 'px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary'

const PLATFORM_ICON: Record<Platform, string> = {
  discord: '🎮', telegram: '✈️', whatsapp: '💬', slack: '🔷',
  email: '📧', sms: '📱', imessage: '💙',
}

const STATUS_CLS: Record<ChannelStatus, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  inactive: 'bg-secondary text-muted-foreground border-border',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const PLATFORMS: Platform[] = ['discord', 'telegram', 'whatsapp', 'slack', 'email', 'sms', 'imessage']

// ── Micro helpers ─────────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }): React.JSX.Element {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>
}

function Empty({ msg }: { msg: string }): React.JSX.Element {
  return <div className="text-center py-12 text-muted-foreground text-sm">{msg}</div>
}

function relativeTime(ts: number | null): string {
  if (!ts) return 'Never'
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommunicationsPanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('channels')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [stats, setStats] = useState<StatsData | null>(null)

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/communications?tab=${tab}`)
      if (!res.ok) throw new Error(`Failed to load ${tab}`)
      const data = await res.json()
      if (tab === 'channels') setChannels(data.channels ?? [])
      else if (tab === 'messages') setMessages(data.messages ?? [])
      else setStats(data as StatsData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Communications load failed:', err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [tab])

  useEffect(() => { loadData() }, [loadData])

  const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: 'channels', label: 'Channels' },
    { key: 'messages', label: 'Messages' },
    { key: 'stats', label: 'Stats' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Communications Hub</h1>
            <p className="text-muted-foreground mt-1">Multi-channel messaging status dashboard</p>
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
        <Loader variant="panel" label={`Loading ${tab}`} />
      ) : tab === 'channels' ? (
        <ChannelsTab channels={channels} onRefresh={loadData} />
      ) : tab === 'messages' ? (
        <MessagesTab messages={messages} channels={channels} onRefresh={loadData} />
      ) : (
        <StatsTab stats={stats} />
      )}
    </div>
  )
}

// ── Channels tab ──────────────────────────────────────────────────────────────

function ChannelsTab({ channels, onRefresh }: { channels: Channel[]; onRefresh: () => void }): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', platform: 'slack' as Platform, webhook_url: '' })

  const handleAdd = async (): Promise<void> => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const body: Record<string, unknown> = { action: 'add_channel', name: form.name, platform: form.platform }
      if (form.webhook_url.trim()) body.webhook_url = form.webhook_url.trim()
      const res = await fetch('/api/communications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to add channel')
      setForm({ name: '', platform: 'slack', webhook_url: '' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Add channel failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Channel'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">New Channel</div>
          <div className="grid grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Channel name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <select className={INPUT} value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value as Platform })}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className={`${INPUT} col-span-2`} placeholder="Webhook URL (optional)" value={form.webhook_url} onChange={e => setForm({ ...form, webhook_url: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save Channel'}</Button>
        </div>
      )}
      {channels.length === 0 ? <Empty msg="No channels configured yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {channels.map(ch => (
            <div key={ch.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden>{PLATFORM_ICON[ch.platform]}</span>
                  <span className="text-sm font-medium text-foreground">{ch.name}</span>
                </div>
                <Badge label={ch.status} cls={STATUS_CLS[ch.status]} />
              </div>
              <div className="text-xs text-muted-foreground capitalize">{ch.platform}</div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{ch.message_count.toLocaleString()} messages</span>
                <span>Active {relativeTime(ch.last_message_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Messages tab ──────────────────────────────────────────────────────────────

function MessagesTab({ messages, channels, onRefresh }: { messages: Message[]; channels: Channel[]; onRefresh: () => void }): React.JSX.Element {
  const [filter, setFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ channel_id: '', sender: '', content: '', direction: 'inbound' as Direction })

  const filtered = filter === 'all' ? messages : messages.filter(m => String(m.channel_id) === filter)

  const handleSend = async (): Promise<void> => {
    if (!form.content.trim() || !form.channel_id) return
    setBusy(true)
    try {
      const res = await fetch('/api/communications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_message', channel_id: Number(form.channel_id), direction: form.direction, sender: form.sender, content: form.content }),
      })
      if (!res.ok) throw new Error('Failed to send message')
      setForm({ channel_id: '', sender: '', content: '', direction: 'inbound' })
      setShowForm(false)
      onRefresh()
    } catch (err) { log.error('Send message failed:', err) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select className={`${INPUT} max-w-xs`} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All channels</option>
          {channels.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <Button size="sm" onClick={() => setShowForm(v => !v)} className="ml-auto">{showForm ? 'Cancel' : '+ Log Message'}</Button>
      </div>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium text-foreground">Log Message</div>
          <div className="grid grid-cols-2 gap-3">
            <select className={INPUT} value={form.channel_id} onChange={e => setForm({ ...form, channel_id: e.target.value })}>
              <option value="">Select channel *</option>
              {channels.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            <select className={INPUT} value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value as Direction })}>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <input className={INPUT} placeholder="Sender" value={form.sender} onChange={e => setForm({ ...form, sender: e.target.value })} />
            <input className={`${INPUT} col-span-2`} placeholder="Content *" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
          </div>
          <Button size="sm" onClick={handleSend} disabled={busy || !form.content.trim() || !form.channel_id}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      )}
      {filtered.length === 0 ? <Empty msg="No messages found" /> : (
        <div className="space-y-2">
          {filtered.map(msg => (
            <div key={msg.id} className="rounded-lg border border-border bg-card px-4 py-3 flex items-start gap-3">
              <span className="text-base mt-0.5 shrink-0" aria-hidden>{msg.direction === 'inbound' ? '←' : '→'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-medium text-foreground">{msg.sender || 'Unknown'}</span>
                  <span className="text-xs text-muted-foreground">{PLATFORM_ICON[msg.platform]} {msg.channel_name}</span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">{relativeTime(msg.created_at)}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Stats tab ─────────────────────────────────────────────────────────────────

function StatsTab({ stats }: { stats: StatsData | null }): React.JSX.Element {
  if (!stats) return <Empty msg="No statistics available" />

  const { platformStats, totals } = stats

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {([
          { label: 'Total Channels', value: totals.total_channels },
          { label: 'Active Channels', value: totals.active_count },
          { label: 'Total Messages', value: (totals.total_messages ?? 0).toLocaleString() },
        ] as const).map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>
      {platformStats.length === 0 ? <Empty msg="No platform data yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {platformStats.map(ps => (
            <div key={ps.platform} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>{PLATFORM_ICON[ps.platform as Platform] ?? '📡'}</span>
                <span className="text-sm font-medium text-foreground capitalize">{ps.platform}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{ps.active_channels} active channel{ps.active_channels !== 1 ? 's' : ''}</span>
                <span>{ps.total_messages.toLocaleString()} messages</span>
              </div>
              <div className="text-xs text-muted-foreground">Last active: {relativeTime(ps.last_activity)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
