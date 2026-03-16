'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { VoiceOrb, type VoiceOrbState } from '@/components/voice/voice-orb'

const log = createClientLogger('VoicePanel')

// ---------------------------------------------------------------------------
// Types (readonly — immutable data flow)
// ---------------------------------------------------------------------------

interface VoiceHistoryEntry {
  readonly id: number
  readonly transcript: string
  readonly response: string
  readonly duration_ms: number
  readonly created_at: number
}

interface VoiceLocalSettings {
  readonly provider: string
  readonly voice: string
  readonly speed: number
  readonly pitch: number
  readonly volume: number
}

type TtsProvider = 'browser' | 'google' | 'azure' | 'elevenlabs'

const TTS_PROVIDERS: readonly { value: TtsProvider; label: string }[] = [
  { value: 'browser', label: 'Browser (Web Speech)' },
  { value: 'google', label: 'Google Cloud TTS' },
  { value: 'azure', label: 'Azure Cognitive' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
]

const QUICK_COMMANDS = [
  'Status report',
  'Agent briefing',
  'Task summary',
  'System health',
  'Cost overview',
  'Security scan',
] as const

const DEFAULT_SETTINGS: VoiceLocalSettings = {
  provider: 'browser',
  voice: 'default',
  speed: 1.0,
  pitch: 1.0,
  volume: 0.8,
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchHistory(): Promise<VoiceHistoryEntry[]> {
  const res = await fetch('/api/voice?tab=history')
  if (!res.ok) throw new Error('Failed to fetch voice history')
  const data = await res.json() as { history: VoiceHistoryEntry[] }
  return data.history
}

async function logVoiceCommand(
  transcript: string,
  durationMs: number,
): Promise<VoiceHistoryEntry> {
  const res = await fetch('/api/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'log_voice',
      transcript,
      response: '[Processed via TTS]',
      duration_ms: durationMs,
    }),
  })
  if (!res.ok) throw new Error('Failed to log voice command')
  const data = await res.json() as { entry: VoiceHistoryEntry }
  return data.entry
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTimestamp(epochSec: number): string {
  const date = new Date(epochSec * 1000)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SliderField({
  label, value, min, max, step, display, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-foreground">{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>
  )
}

function SettingsSection({
  settings,
  onChange,
}: {
  readonly settings: VoiceLocalSettings
  readonly onChange: (next: VoiceLocalSettings) => void
}): React.JSX.Element {
  const update = useCallback(
    (key: keyof VoiceLocalSettings, value: string | number): void => {
      onChange({ ...settings, [key]: value })
    },
    [settings, onChange],
  )

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        Voice Settings
      </h3>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">TTS Provider</span>
        <select
          value={settings.provider}
          onChange={(e) => update('provider', e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {TTS_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Voice</span>
        <input
          type="text"
          value={settings.voice}
          onChange={(e) => update('voice', e.target.value)}
          placeholder="default"
          className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <SliderField
        label="Speed" value={settings.speed}
        min={0.25} max={4} step={0.25}
        display={`${settings.speed}x`}
        onChange={(v) => update('speed', v)}
      />
      <SliderField
        label="Pitch" value={settings.pitch}
        min={0} max={2} step={0.1}
        display={settings.pitch.toFixed(1)}
        onChange={(v) => update('pitch', v)}
      />
      <SliderField
        label="Volume" value={settings.volume}
        min={0} max={1} step={0.05}
        display={`${Math.round(settings.volume * 100)}%`}
        onChange={(v) => update('volume', v)}
      />
    </div>
  )
}

function HistoryBubble({ entry }: { readonly entry: VoiceHistoryEntry }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600/20 border border-blue-500/30 px-3 py-2">
          <p className="text-sm text-blue-200">{entry.transcript}</p>
          <span className="mt-1 block text-right text-2xs font-mono text-blue-400/60">
            {formatTimestamp(entry.created_at)}
          </span>
        </div>
      </div>
      {entry.response ? (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-700/40 border border-slate-600/30 px-3 py-2">
            <p className="text-sm text-slate-300">{entry.response}</p>
            <span className="mt-1 block text-2xs font-mono text-slate-500">
              {formatDuration(entry.duration_ms)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function HistoryList({
  entries, loading, error,
}: {
  readonly entries: VoiceHistoryEntry[]
  readonly loading: boolean
  readonly error: string | null
}): React.JSX.Element {
  if (loading) return <Loader label="Loading history..." />

  if (error) {
    return (
      <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
        {error}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        No voice interactions yet — click the orb or use a quick command.
      </div>
    )
  }

  return (
    <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
      {entries.map((entry) => (
        <HistoryBubble key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function QuickActions({
  onCommand,
  disabled,
}: {
  readonly onCommand: (cmd: string) => void
  readonly disabled: boolean
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        Quick Commands
      </h3>
      <div className="flex flex-wrap gap-2">
        {QUICK_COMMANDS.map((cmd) => (
          <Button
            key={cmd}
            variant="outline"
            size="xs"
            disabled={disabled}
            onClick={() => onCommand(cmd)}
          >
            {cmd}
          </Button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// VoicePanel
// ---------------------------------------------------------------------------

export function VoicePanel(): React.JSX.Element {
  const [orbState, setOrbState] = useState<VoiceOrbState>('idle')
  const [settings, setSettings] = useState<VoiceLocalSettings>(DEFAULT_SETTINGS)
  const [history, setHistory] = useState<VoiceHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // Load voice history on mount
  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const entries = await fetchHistory()
        if (cancelled) return
        setHistory(entries)
        setHistoryError(null)
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Failed to load history'
        log.error({ err }, msg)
        setHistoryError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  // Toggle listening on orb click
  const handleOrbClick = useCallback((): void => {
    setOrbState((prev) => (prev === 'listening' ? 'idle' : 'listening'))
  }, [])

  // Execute a voice command, log it, and refresh history
  const handleCommand = useCallback(
    async (text: string): Promise<void> => {
      setOrbState('processing')
      const startMs = Date.now()
      try {
        const durationMs = Date.now() - startMs
        const entry = await logVoiceCommand(text, durationMs)
        setHistory((prev) => [entry, ...prev])
        setOrbState('speaking')
        // Brief speaking indication then return to idle
        setTimeout(() => setOrbState('idle'), 2000)
      } catch (err) {
        log.error({ err }, 'Voice command failed')
        setHistoryError('Failed to send voice command')
        setOrbState('idle')
      }
    },
    [],
  )

  // Refresh history
  const handleRefresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const entries = await fetchHistory()
      setHistory(entries)
      setHistoryError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Refresh failed'
      log.error({ err }, msg)
      setHistoryError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground tracking-wide uppercase">
          Voice Engine
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          aria-label="Refresh history"
        >
          Refresh
        </Button>
      </div>

      {/* Voice Orb */}
      <div className="flex justify-center py-4">
        <VoiceOrb state={orbState} onClick={handleOrbClick} size={96} />
      </div>

      {/* Quick commands */}
      <QuickActions
        onCommand={handleCommand}
        disabled={orbState === 'processing'}
      />

      {/* Settings (client-side only for TTS config) */}
      <SettingsSection settings={settings} onChange={setSettings} />

      {/* Voice history */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Voice History
        </h3>
        <HistoryList entries={history} loading={loading} error={historyError} />
      </div>
    </div>
  )
}
