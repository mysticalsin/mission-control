'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('SttPanel')

// --- Types (readonly -- immutable data flow) ---

interface TranscriptionEntry {
  readonly id: string
  readonly source: string
  readonly filename: string | null
  readonly duration_seconds: number | null
  readonly language: string | null
  readonly text: string
  readonly word_count: number
  readonly processing_time: number | null
  readonly model: string | null
  readonly created_at: string
}

interface SttHealthStatus {
  readonly ok: boolean
  readonly whisper_available: boolean
  readonly ffmpeg_available: boolean
  readonly model: string
  readonly device: string
}

interface SttSettings {
  readonly language: string
  readonly model: string
}

type TabId = 'live' | 'history' | 'settings'

const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'live', label: 'Live Transcription' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
]

const SUPPORTED_FORMATS = [
  '.ogg', '.opus', '.mp3', '.wav', '.m4a', '.webm', '.flac', '.aac', '.mp4',
] as const

const LANGUAGES: readonly { readonly value: string; readonly label: string }[] = [
  { value: '', label: 'Auto-detect' },  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },     { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },    { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' }, { value: 'nl', label: 'Dutch' },
  { value: 'ja', label: 'Japanese' },   { value: 'zh', label: 'Chinese' },
]

const DEFAULT_SETTINGS: SttSettings = { language: '', model: 'distil-large-v3' }

// --- Data-fetching helpers ---

async function fetchHistory(limit = 20): Promise<TranscriptionEntry[]> {
  const res = await fetch(`/api/stt?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch transcription history')
  const data = (await res.json()) as { ok: boolean; transcriptions: TranscriptionEntry[] }
  return data.transcriptions ?? []
}

async function fetchHealth(): Promise<SttHealthStatus> {
  const res = await fetch('/api/stt/health')
  if (!res.ok) throw new Error('Failed to fetch STT health')
  return (await res.json()) as SttHealthStatus
}

async function uploadAudio(
  file: File,
  language: string,
): Promise<TranscriptionEntry & { ok: boolean; error?: string }> {
  const form = new FormData()
  form.append('file', file)
  if (language) form.append('language', language)
  form.append('source', 'dashboard')
  const res = await fetch('/api/stt', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}

// --- LiveTab ---

function LiveTab({
  settings, onTranscriptionComplete,
}: {
  readonly settings: SttSettings
  readonly onTranscriptionComplete: () => void
}): React.ReactElement {
  const [recording, setRecording] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const stopAndTranscribe = useCallback(async (blob: Blob) => {
    setUploading(true)
    setError(null)
    try {
      const file = new File([blob], 'recording.webm', { type: 'audio/webm' })
      const result = await uploadAudio(file, settings.language)
      if (!result.ok) { setError(result.error ?? 'Transcription failed'); return }
      setLiveText(result.text)
      onTranscriptionComplete()
      log.info('Live transcription complete', { words: result.word_count })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      log.error('Live transcription failed', { error: msg })
    } finally {
      setUploading(false)
    }
  }, [settings.language, onTranscriptionComplete])

  const handleRecord = useCallback(async () => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setRecording(false)
      return
    }
    setError(null)
    setLiveText('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        void stopAndTranscribe(new Blob(chunksRef.current, { type: 'audio/webm' }))
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mic access denied'
      setError(msg)
      log.error('Mic access error', { error: msg })
    }
  }, [recording, stopAndTranscribe])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setLiveText('')
    try {
      const result = await uploadAudio(file, settings.language)
      if (!result.ok) { setError(result.error ?? 'Transcription failed'); return }
      setLiveText(result.text)
      onTranscriptionComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [settings.language, onTranscriptionComplete])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          onClick={handleRecord}
          disabled={uploading}
          variant={recording ? 'destructive' : 'default'}
          className="min-w-[140px]"
        >
          {recording ? 'Stop Recording' : 'Start Recording'}
        </Button>
        <span className="text-xs text-zinc-400">
          {recording ? 'Recording... click to stop' : 'or'}
        </span>
        <Button
          variant="outline"
          disabled={uploading || recording}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_FORMATS.join(',')}
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
      {uploading && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader variant="inline" /> Transcribing audio...
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {liveText && !uploading && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
          <h4 className="mb-2 text-xs font-medium uppercase text-zinc-400">
            Transcription Result
          </h4>
          <p className="whitespace-pre-wrap text-sm text-zinc-200">{liveText}</p>
        </div>
      )}
      {!liveText && !uploading && !error && (
        <p className="text-sm text-zinc-500">
          Record from your microphone or upload an audio file to transcribe.
        </p>
      )}
    </div>
  )
}

// --- HistoryTab ---

function HistoryTab(): React.ReactElement {
  const [entries, setEntries] = useState<readonly TranscriptionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchHistory(50)
      .then((data) => { if (!cancelled) setEntries(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="flex justify-center py-8"><Loader variant="inline" /></div>
  if (error) return (
    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {error}
    </div>
  )
  if (entries.length === 0) return (
    <p className="py-8 text-center text-sm text-zinc-500">
      No transcriptions yet. Use the Live tab to create one.
    </p>
  )

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
            <span>{entry.filename ?? entry.source}</span>
            <span>{new Date(entry.created_at).toLocaleString()}</span>
          </div>
          <p className="line-clamp-3 text-sm text-zinc-200">{entry.text}</p>
          <div className="mt-2 flex gap-3 text-xs text-zinc-500">
            {entry.language && <span>Lang: {entry.language}</span>}
            {entry.duration_seconds != null && <span>{entry.duration_seconds.toFixed(1)}s</span>}
            <span>{entry.word_count} words</span>
            {entry.processing_time != null && <span>Processed in {entry.processing_time.toFixed(1)}s</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// --- SettingsTab ---

function SettingsTab({
  settings, health, onSettingsChange,
}: {
  readonly settings: SttSettings
  readonly health: SttHealthStatus | null
  readonly onSettingsChange: (next: SttSettings) => void
}): React.ReactElement {
  return (
    <div className="space-y-6">
      {health && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h4 className="mb-2 text-xs font-medium uppercase text-zinc-400">Engine Status</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-zinc-400">Status</span>
            <span className={health.ok ? 'text-emerald-400' : 'text-red-400'}>
              {health.ok ? 'Ready' : 'Unavailable'}
            </span>
            <span className="text-zinc-400">Whisper</span>
            <span className={health.whisper_available ? 'text-emerald-400' : 'text-red-400'}>
              {health.whisper_available ? 'Available' : 'Missing'}
            </span>
            <span className="text-zinc-400">FFmpeg</span>
            <span className={health.ffmpeg_available ? 'text-emerald-400' : 'text-red-400'}>
              {health.ffmpeg_available ? 'Available' : 'Missing'}
            </span>
            <span className="text-zinc-400">Model</span>
            <span className="text-zinc-200">{health.model}</span>
            <span className="text-zinc-400">Device</span>
            <span className="text-zinc-200">{health.device}</span>
          </div>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Language</label>
          <select
            value={settings.language}
            onChange={(e) => onSettingsChange({ ...settings, language: e.target.value })}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Model</label>
          <input
            type="text"
            value={settings.model}
            onChange={(e) => onSettingsChange({ ...settings, model: e.target.value })}
            placeholder="distil-large-v3"
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Whisper model used by the Jarvis backend (read-only display).
          </p>
        </div>
      </div>
    </div>
  )
}

// --- Main panel ---

export function SttPanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('live')
  const [settings, setSettings] = useState<SttSettings>(DEFAULT_SETTINGS)
  const [health, setHealth] = useState<SttHealthStatus | null>(null)
  const [historyKey, setHistoryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchHealth()
      .then((data) => { if (!cancelled) setHealth(data) })
      .catch((err) => log.error('Health check failed', { error: String(err) }))
    return () => { cancelled = true }
  }, [])

  const handleTranscriptionComplete = useCallback(() => {
    setHistoryKey((prev) => prev + 1)
  }, [])

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex gap-1 border-b border-zinc-700 pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {activeTab === 'live' && (
          <LiveTab settings={settings} onTranscriptionComplete={handleTranscriptionComplete} />
        )}
        {activeTab === 'history' && <HistoryTab key={historyKey} />}
        {activeTab === 'settings' && (
          <SettingsTab settings={settings} health={health} onSettingsChange={setSettings} />
        )}
      </div>
    </div>
  )
}
