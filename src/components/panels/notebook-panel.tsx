'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('Notebook')

// ── Types ────────────────────────────────────────────────────────────────────

type NotebookCapability =
  | 'deep-search'
  | 'presentation'
  | 'statistics'
  | 'video'
  | 'audio-resume'
  | 'mental-cards'
  | 'quiz'
  | 'infography'
  | 'dashboard'
  | 'report'

interface CapabilityConfig {
  readonly id: NotebookCapability
  readonly label: string
  readonly description: string
  readonly icon: string
}

interface GenerationResult {
  readonly id: string
  readonly type: NotebookCapability
  readonly status: 'completed' | 'processing' | 'error'
  readonly output_url?: string
  readonly content?: string
  readonly error?: string
  readonly created_at: string
}

interface WebhookConfig {
  readonly id: string
  readonly platform: 'slack' | 'teams' | 'discord'
  readonly url: string
  readonly events: readonly string[]
  readonly active: boolean
}

type TabId = 'generate' | 'history' | 'delivery'

// ── Constants ────────────────────────────────────────────────────────────────

const DISCORD_WEBHOOK_KEY = 'notebook_discord_webhook'

const CAPABILITIES: readonly CapabilityConfig[] = [
  { id: 'deep-search', label: 'Deep Search', description: 'Comprehensive research across sources', icon: '🔍' },
  { id: 'presentation', label: 'Presentation', description: 'Auto-generate slide decks', icon: '📊' },
  { id: 'statistics', label: 'Statistics', description: 'Data analysis and visualizations', icon: '📈' },
  { id: 'video', label: 'Video', description: 'Generate video summaries', icon: '🎬' },
  { id: 'audio-resume', label: 'Audio Resume', description: 'Audio podcast-style summaries', icon: '🎧' },
  { id: 'mental-cards', label: 'Mental Cards', description: 'Flashcard-style learning aids', icon: '🧠' },
  { id: 'quiz', label: 'Quiz', description: 'Interactive quiz generation', icon: '❓' },
  { id: 'infography', label: 'Infography', description: 'Visual infographic creation', icon: '🎨' },
  { id: 'dashboard', label: 'Dashboard', description: 'Interactive data dashboards', icon: '📋' },
  { id: 'report', label: 'Report', description: 'Detailed written reports', icon: '📝' },
] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadSavedWebhook(): string {
  if (typeof window === 'undefined') return ''
  try { return localStorage.getItem(DISCORD_WEBHOOK_KEY) ?? '' } catch { return '' }
}

function saveWebhook(url: string): void {
  if (typeof window === 'undefined') return
  try {
    if (url.trim()) { localStorage.setItem(DISCORD_WEBHOOK_KEY, url.trim()) }
    else { localStorage.removeItem(DISCORD_WEBHOOK_KEY) }
  } catch { /* storage unavailable */ }
}

function isValidDiscordWebhook(url: string): boolean {
  return /^https:\/\/discord\.com\/api\/webhooks\/\d+\/.+$/.test(url.trim())
}

// ── Component ────────────────────────────────────────────────────────────────

export function NotebookPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('generate')

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Notebook LM</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI-powered document intelligence — search, analyze, generate &amp; deliver
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
        {([
          { id: 'generate' as const, label: 'Generate' },
          { id: 'history' as const, label: 'History' },
          { id: 'delivery' as const, label: 'Discord Delivery' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.id === 'delivery' && <span className="mr-1">🟣</span>}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'generate' && <GenerateTab />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'delivery' && <DeliveryTab />}
      </div>
    </div>
  )
}

// ── Generate Tab ─────────────────────────────────────────────────────────────

function GenerateTab(): React.ReactElement {
  const [selectedCapability, setSelectedCapability] = useState<NotebookCapability>('deep-search')
  const [sourceText, setSourceText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sendToDiscord, setSendToDiscord] = useState(true)
  const [discordUrl, setDiscordUrl] = useState('')
  const [discordSent, setDiscordSent] = useState(false)

  // Load saved Discord webhook on mount
  useEffect(() => { setDiscordUrl(loadSavedWebhook()) }, [])

  const deliverToDiscord = useCallback(async (data: GenerationResult): Promise<void> => {
    const webhook = discordUrl.trim()
    if (!webhook || !isValidDiscordWebhook(webhook)) return

    const capLabel = CAPABILITIES.find(c => c.id === data.type)?.label ?? data.type
    const message = [
      `**Notebook LM — ${capLabel}**`,
      data.content ? data.content.slice(0, 1900) : `Status: ${data.status}`,
      data.output_url ? `\nDownload: ${data.output_url}` : '',
    ].filter(Boolean).join('\n')

    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
      })
      setDiscordSent(true)
    } catch (err) {
      log.error('Discord delivery failed', err instanceof Error ? err.message : 'Unknown')
    }
  }, [discordUrl])

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!sourceText.trim() && !sourceUrl.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setDiscordSent(false)

    try {
      const res = await fetch('/api/notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capability: selectedCapability,
          source_text: sourceText.trim() || undefined,
          source_url: sourceUrl.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data: GenerationResult = await res.json()
      setResult(data)

      // Auto-deliver to Discord if enabled
      if (sendToDiscord && isValidDiscordWebhook(discordUrl)) {
        await deliverToDiscord(data)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      log.error('Generation failed', message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [selectedCapability, sourceText, sourceUrl, sendToDiscord, discordUrl, deliverToDiscord])

  return (
    <div className="flex flex-col gap-4">
      {/* Discord quick-connect banner */}
      {!isValidDiscordWebhook(discordUrl) && (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 flex items-center gap-3">
          <span className="text-lg shrink-0">🟣</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Connect Discord for auto-delivery</p>
            <p className="text-xs text-muted-foreground">Generated content will be sent directly to your Discord channel</p>
          </div>
          <input
            type="url"
            value={discordUrl}
            onChange={e => { setDiscordUrl(e.target.value); saveWebhook(e.target.value) }}
            placeholder="Paste Discord webhook URL…"
            className="flex-1 max-w-xs rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
      )}

      {/* Capability grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {CAPABILITIES.map(cap => (
          <button
            key={cap.id}
            onClick={() => setSelectedCapability(cap.id)}
            className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors ${
              selectedCapability === cap.id
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:border-foreground/20'
            }`}
          >
            <span className="text-lg">{cap.icon}</span>
            <span className="text-xs font-medium">{cap.label}</span>
          </button>
        ))}
      </div>

      {/* Source input */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">Source Document or URL</label>
        <input
          type="url"
          value={sourceUrl}
          onChange={e => setSourceUrl(e.target.value)}
          placeholder="https://example.com/document.pdf"
          className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <textarea
          value={sourceText}
          onChange={e => setSourceText(e.target.value)}
          placeholder="Or paste your source text here..."
          rows={6}
          className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none"
        />
      </div>

      {/* Discord delivery toggle + Generate */}
      <div className="flex items-center gap-3">
        <Button
          variant="default"
          onClick={handleGenerate}
          disabled={loading || (!sourceText.trim() && !sourceUrl.trim())}
        >
          {loading ? (
            <><Loader variant="inline" /> Generating {CAPABILITIES.find(c => c.id === selectedCapability)?.label}...</>
          ) : (
            `Generate ${CAPABILITIES.find(c => c.id === selectedCapability)?.label}`
          )}
        </Button>

        {isValidDiscordWebhook(discordUrl) && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendToDiscord}
              onChange={e => setSendToDiscord(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <span>🟣</span> Auto-send to Discord
            </span>
          </label>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              {CAPABILITIES.find(c => c.id === result.type)?.label} — {result.status}
            </span>
            <div className="flex items-center gap-2">
              {discordSent && (
                <span className="text-xs text-indigo-400 flex items-center gap-1">
                  🟣 Sent to Discord
                </span>
              )}
              <span className="text-xs text-muted-foreground">{result.created_at}</span>
            </div>
          </div>
          {result.content && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{result.content}</p>
          )}
          {result.output_url && (
            <a
              href={result.output_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:underline mt-2 inline-block"
            >
              Download output
            </a>
          )}
          {result.error && (
            <p className="text-sm text-red-400 mt-2">{result.error}</p>
          )}

          {/* Manual Discord send for results not auto-sent */}
          {!discordSent && isValidDiscordWebhook(discordUrl) && result.status === 'completed' && (
            <button
              onClick={() => deliverToDiscord(result)}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              🟣 Send to Discord
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab(): React.ReactElement {
  const [items, setItems] = useState<readonly GenerationResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const fetchHistory = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/notebook?action=history')
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setItems(data.items ?? data ?? [])
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }, [])

  if (!loaded && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-muted-foreground">Load generation history from Jarvis</p>
        <Button variant="outline" size="sm" onClick={fetchHistory}>Load History</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader variant="inline" label="Loading history..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchHistory}>Retry</Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        No generation history yet. Create your first notebook output above.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <div key={item.id} className="rounded-md border border-border bg-secondary/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {CAPABILITIES.find(c => c.id === item.type)?.icon}{' '}
              {CAPABILITIES.find(c => c.id === item.type)?.label}
            </span>
            <span className="text-xs text-muted-foreground">{item.created_at}</span>
          </div>
          <span className={`text-xs ${item.status === 'completed' ? 'text-green-400' : item.status === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
            {item.status}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Delivery Tab — Discord-first webhook management ─────────────────────────

function DeliveryTab(): React.ReactElement {
  const [discordUrl, setDiscordUrl] = useState('')
  const [webhooks, setWebhooks] = useState<readonly WebhookConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [saving, setSaving] = useState(false)
  const [newPlatform, setNewPlatform] = useState<'slack' | 'teams' | 'discord'>('discord')
  const [newUrl, setNewUrl] = useState('')

  // Load saved Discord webhook
  useEffect(() => { setDiscordUrl(loadSavedWebhook()) }, [])

  const handleSaveDiscord = useCallback((): void => {
    saveWebhook(discordUrl)
  }, [discordUrl])

  const handleTestDiscord = useCallback(async (): Promise<void> => {
    if (!isValidDiscordWebhook(discordUrl)) return
    setTestStatus('sending')
    try {
      await fetch(discordUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '**Notebook LM** — Test message from Ultron Mission Control. Discord delivery is working!',
        }),
      })
      setTestStatus('success')
      saveWebhook(discordUrl)
    } catch {
      setTestStatus('error')
    }
  }, [discordUrl])

  const fetchWebhooks = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/notebook/webhook')
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setWebhooks(data.webhooks ?? data ?? [])
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [])

  const addWebhook = useCallback(async (): Promise<void> => {
    if (!newUrl.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/notebook/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: newPlatform, url: newUrl.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setNewUrl('')
      await fetchWebhooks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add webhook')
    } finally {
      setSaving(false)
    }
  }, [newPlatform, newUrl, fetchWebhooks])

  return (
    <div className="flex flex-col gap-5">
      {/* Discord quick setup — prominent card */}
      <div className="rounded-xl border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-xl shrink-0">
            🟣
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Discord Auto-Delivery</h3>
            <p className="text-xs text-muted-foreground">
              Generated notebooks are automatically sent to your Discord channel
            </p>
          </div>
          {isValidDiscordWebhook(discordUrl) && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
              Connected
            </span>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Discord Webhook URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={discordUrl}
              onChange={e => setDiscordUrl(e.target.value)}
              onBlur={handleSaveDiscord}
              placeholder="https://discord.com/api/webhooks/..."
              className="flex-1 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestDiscord}
              disabled={!isValidDiscordWebhook(discordUrl) || testStatus === 'sending'}
            >
              {testStatus === 'sending' ? 'Sending…' : testStatus === 'success' ? 'Sent!' : testStatus === 'error' ? 'Failed' : 'Test'}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            Server Settings → Integrations → Webhooks → New Webhook → Copy URL
          </p>
        </div>

        {isValidDiscordWebhook(discordUrl) && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Auto-delivery enabled on Generate tab
            </span>
            <span>Results sent after each generation</span>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
        <h4 className="text-sm font-medium text-foreground">How Discord Delivery Works</h4>
        <div className="grid grid-cols-3 gap-3">
          {[
            { step: '1', title: 'Paste Webhook', desc: 'Add your Discord webhook URL above' },
            { step: '2', title: 'Generate Content', desc: 'Use any capability on the Generate tab' },
            { step: '3', title: 'Auto-Delivered', desc: 'Results appear in your Discord channel' },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                {s.step}
              </span>
              <div>
                <p className="text-xs font-medium text-foreground">{s.title}</p>
                <p className="text-[10px] text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Additional webhooks (Slack/Teams/Discord via server) */}
      <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">Server-Side Webhooks</h4>
          {!loaded && !loading && (
            <Button variant="outline" size="sm" onClick={fetchWebhooks}>Load</Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          For Slack, Teams, or additional Discord channels managed by Jarvis
        </p>

        {loaded && (
          <div className="flex gap-2">
            <select
              value={newPlatform}
              onChange={e => setNewPlatform(e.target.value as typeof newPlatform)}
              className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
            >
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="teams">Teams</option>
            </select>
            <input
              type="url"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="Webhook URL…"
              className="flex-1 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <Button variant="default" size="sm" onClick={addWebhook} disabled={saving || !newUrl.trim()}>
              {saving ? 'Saving…' : 'Add'}
            </Button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Webhook list */}
        {loading ? (
          <Loader variant="inline" label="Loading webhooks..." />
        ) : loaded && webhooks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No server-side webhooks configured yet.
          </p>
        ) : loaded ? (
          <div className="flex flex-col gap-2">
            {webhooks.map(wh => (
              <div key={wh.id} className="flex items-center justify-between rounded-md border border-border bg-background p-3">
                <div>
                  <span className="text-sm font-medium text-foreground capitalize">{wh.platform}</span>
                  <p className="text-xs text-muted-foreground truncate max-w-md">{wh.url}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${wh.active ? 'bg-green-500/10 text-green-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                  {wh.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
