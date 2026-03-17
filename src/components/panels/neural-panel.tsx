'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('NeuralPanel')

// ---------------------------------------------------------------------------
// Types (readonly -- immutable data flow)
// ---------------------------------------------------------------------------

interface ProviderInfo {
  readonly name: string
  readonly label: string
  readonly status: 'healthy' | 'down' | 'unknown'
  readonly latencyMs: number
  readonly defaultModel: string
  readonly models: readonly string[]
  readonly cost: string
}

interface ChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly provider?: string
  readonly model?: string
  readonly timestamp: number
}

interface UsageEntry {
  readonly provider: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalCost: number
  readonly requestCount: number
}

type TabId = 'providers' | 'chat' | 'usage'

const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'providers', label: 'Provider Status' },
  { id: 'chat', label: 'Chat Playground' },
  { id: 'usage', label: 'Usage Stats' },
]

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  down: 'bg-red-500/20 text-red-400 border-red-500/30',
  unknown: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
} as const

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchProviders(): Promise<ProviderInfo[]> {
  const res = await fetch('/api/neural')
  if (!res.ok) throw new Error('Failed to fetch providers')
  const data = (await res.json()) as { providers: ProviderInfo[] }
  return data.providers
}

async function sendChatMessage(
  prompt: string,
  provider: string,
  model: string,
): Promise<ChatMessage> {
  const res = await fetch('/api/neural', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider, model }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Chat request failed')
  }
  return (await res.json()) as ChatMessage
}

async function fetchUsage(): Promise<UsageEntry[]> {
  const res = await fetch('/api/neural/usage')
  if (!res.ok) throw new Error('Failed to fetch usage stats')
  const data = (await res.json()) as { usage: UsageEntry[] }
  return data.usage
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProviderCard({ provider }: { readonly provider: ProviderInfo }): React.ReactElement {
  const colorClass = STATUS_COLORS[provider.status] ?? STATUS_COLORS.unknown
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{provider.label}</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>
          {provider.status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Model: <span className="text-foreground">{provider.defaultModel}</span>
      </p>
      {provider.latencyMs > 0 && (
        <p className="text-xs text-muted-foreground">
          Latency: <span className="text-foreground">{provider.latencyMs}ms</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">{provider.cost}</p>
    </div>
  )
}

function EmptyState({ message }: { readonly message: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Provider Status
// ---------------------------------------------------------------------------

function ProvidersTab(): React.ReactElement {
  const [providers, setProviders] = useState<readonly ProviderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setProviders(await fetchProviders())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      log.error('Failed to load providers', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <Loader label="Loading providers..." />
  if (error) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-red-400">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    )
  }
  if (providers.length === 0) return <EmptyState message="No LLM providers configured." />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{providers.length} providers</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Refresh</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {providers.map((p) => <ProviderCard key={p.name} provider={p} />)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Chat Playground
// ---------------------------------------------------------------------------

function ChatTab({ providers }: { readonly providers: readonly ProviderInfo[] }): React.ReactElement {
  const [prompt, setPrompt] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('auto')
  const [selectedModel, setSelectedModel] = useState('')
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableModels = providers.find((p) => p.name === selectedProvider)?.models ?? []

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || sending) return
    const userMsg: ChatMessage = { role: 'user', content: prompt.trim(), timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    setPrompt('')
    setSending(true)
    setError(null)
    try {
      const reply = await sendChatMessage(userMsg.content, selectedProvider, selectedModel)
      setMessages((prev) => [...prev, { ...reply, timestamp: Date.now() }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed'
      log.error('Chat send failed', msg)
      setError(msg)
    } finally {
      setSending(false)
    }
  }, [prompt, sending, selectedProvider, selectedModel])

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          value={selectedProvider}
          onChange={(e) => { setSelectedProvider(e.target.value); setSelectedModel('') }}
        >
          <option value="auto">Auto (cascade)</option>
          {providers.map((p) => (
            <option key={p.name} value={p.name}>{p.label}</option>
          ))}
        </select>
        {availableModels.length > 0 && (
          <select
            className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value="">Default model</option>
            {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto space-y-2 rounded-lg border border-border bg-card/50 p-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Send a test prompt to any LLM provider.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={`${msg.timestamp}-${i}`}
            className={`text-sm rounded-md px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-blue-500/10 text-blue-300 ml-8'
                : 'bg-card text-foreground mr-8 border border-border'
            }`}
          >
            {msg.role === 'assistant' && msg.provider && (
              <p className="text-xs text-muted-foreground mb-1">
                via {msg.provider}{msg.model ? ` / ${msg.model}` : ''}
              </p>
            )}
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {sending && <Loader label="Generating..." />}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
          placeholder="Enter a test prompt..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend() }}
          disabled={sending}
        />
        <Button size="sm" onClick={() => void handleSend()} disabled={sending || !prompt.trim()}>
          Send
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Usage Stats
// ---------------------------------------------------------------------------

function UsageTab(): React.ReactElement {
  const [usage, setUsage] = useState<readonly UsageEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setUsage(await fetchUsage())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      log.error('Failed to load usage', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <Loader label="Loading usage stats..." />
  if (error) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-red-400">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    )
  }
  if (usage.length === 0) return <EmptyState message="No usage data yet." />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{usage.length} entries</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Refresh</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="py-2 pr-4">Provider</th>
              <th className="py-2 pr-4">Model</th>
              <th className="py-2 pr-4 text-right">Input Tokens</th>
              <th className="py-2 pr-4 text-right">Output Tokens</th>
              <th className="py-2 text-right">Requests</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => (
              <tr key={`${u.provider}-${u.model}`} className="border-b border-border/50">
                <td className="py-2 pr-4 text-foreground">{u.provider}</td>
                <td className="py-2 pr-4 text-foreground font-mono text-xs">{u.model}</td>
                <td className="py-2 pr-4 text-right text-foreground">
                  {u.inputTokens.toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-right text-foreground">
                  {u.outputTokens.toLocaleString()}
                </td>
                <td className="py-2 text-right text-foreground">{u.requestCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function NeuralPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('providers')
  const [providers, setProviders] = useState<readonly ProviderInfo[]>([])

  // Pre-fetch providers so the chat tab dropdown is ready immediately
  useEffect(() => {
    fetchProviders()
      .then(setProviders)
      .catch((err) => log.error('Provider prefetch failed', String(err)))
  }, [])

  return (
    <div className="flex flex-col h-full space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Neural Hub</h2>
        <p className="text-xs text-muted-foreground">Multi-LLM Integration</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm transition-colors ${
              activeTab === tab.id
                ? 'text-foreground border-b-2 border-blue-500 font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'providers' && <ProvidersTab />}
        {activeTab === 'chat' && <ChatTab providers={providers} />}
        {activeTab === 'usage' && <UsageTab />}
      </div>
    </div>
  )
}
