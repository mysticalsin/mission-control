'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('NanobananaPanel')

// --- Types (readonly -- immutable data flow) ---

interface VideoRecord {
  readonly id: string
  readonly video_id: string
  readonly prompt: string
  readonly resolution: string
  readonly duration: number
  readonly aspect_ratio: string
  readonly status: string
  readonly video_url: string | null
  readonly thumbnail_url: string | null
  readonly credits_used: number
  readonly generation_type: string
  readonly image_urls: readonly string[] | null
  readonly error: string | null
  readonly created_at: string
}

interface NanobananaConfig {
  readonly has_api_key: boolean
  readonly api_status: string
  readonly base_url: string
  readonly credits: { readonly credits_remaining: number; readonly credits_used: number } | null
  readonly local_stats: { readonly total_videos: number; readonly total_credits_used: number }
}

type TabId = 'generate' | 'gallery' | 'settings'
const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'generate', label: 'Generate' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'settings', label: 'Settings' },
]
const RESOLUTIONS = ['480p', '720p', '1080p'] as const
const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3'] as const
const MAX_PROMPT = 500
const MIN_DUR = 3
const MAX_DUR = 12

// --- Data helpers ---

async function fetchVideos(): Promise<readonly VideoRecord[]> {
  const res = await fetch('/api/nanobanana?limit=50&offset=0')
  if (!res.ok) throw new Error('Failed to fetch videos')
  return ((await res.json()) as { videos: VideoRecord[] }).videos
}

async function fetchConfig(): Promise<NanobananaConfig> {
  const res = await fetch('/api/nanobanana/config')
  if (!res.ok) throw new Error('Failed to fetch config')
  return (await res.json()) as NanobananaConfig
}

async function postGenerate(payload: Record<string, unknown>, path: string): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? 'Request failed')
  }
}

async function deleteVideo(id: string): Promise<void> {
  const res = await fetch(`/api/nanobanana/delete?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete video')
}

// --- Main Panel ---

export function NanobananaPanel(): React.ReactElement {
  const [tab, setTab] = useState<TabId>('generate')
  const [videos, setVideos] = useState<readonly VideoRecord[]>([])
  const [config, setConfig] = useState<NanobananaConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [resolution, setResolution] = useState('720p')
  const [duration, setDuration] = useState(5)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [genType, setGenType] = useState<'text' | 'image'>('text')
  const [imageUrls, setImageUrls] = useState('')
  const [generating, setGenerating] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [vids, cfg] = await Promise.all([fetchVideos(), fetchConfig()])
      setVideos(vids)
      setConfig(cfg)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load data'
      log.error('loadData failed', msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleGenerate = useCallback(async () => {
    if (genType === 'text' && !prompt.trim()) return
    try {
      setGenerating(true)
      setError(null)
      if (genType === 'text') {
        await postGenerate(
          { prompt: prompt.trim(), resolution, duration, aspect_ratio: aspectRatio },
          '/api/nanobanana',
        )
      } else {
        const urls = imageUrls.split('\n').map(u => u.trim()).filter(Boolean)
        if (urls.length === 0) { setError('Provide at least one image URL'); return }
        await postGenerate(
          { image_urls: urls, prompt: prompt.trim() || undefined, resolution, duration },
          '/api/nanobanana/animate',
        )
      }
      setPrompt('')
      setImageUrls('')
      await loadData()
      setTab('gallery')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed'
      log.error('handleGenerate failed', msg)
      setError(msg)
    } finally {
      setGenerating(false)
    }
  }, [prompt, resolution, duration, aspectRatio, genType, imageUrls, loadData])

  const handleDelete = useCallback(async (recordId: string) => {
    try {
      await deleteVideo(recordId)
      setVideos(prev => prev.filter(v => v.id !== recordId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      log.error('handleDelete failed', msg)
      setError(msg)
    }
  }, [])

  if (loading) return <Loader label="Loading Nanobanana..." />

  if (error && !config) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/30 p-6 text-center">
        <p className="text-red-400 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={loadData}>Retry</Button>
      </div>
    )
  }

  const inputCls = 'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none'

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {error && <div className="rounded-md border border-red-800 bg-red-950/30 px-4 py-2 text-sm text-red-400">{error}</div>}

      {tab === 'generate' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant={genType === 'text' ? 'default' : 'outline'} size="sm" onClick={() => setGenType('text')}>Text to Video</Button>
            <Button variant={genType === 'image' ? 'default' : 'outline'} size="sm" onClick={() => setGenType('image')}>Image to Video</Button>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">{genType === 'text' ? 'Prompt' : 'Prompt (optional)'}</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={MAX_PROMPT} rows={3}
              placeholder="Describe the video you want to generate..." className={inputCls} />
            <span className="text-xs text-zinc-500">{prompt.length}/{MAX_PROMPT}</span>
          </div>
          {genType === 'image' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Image URLs (one per line)</label>
              <textarea value={imageUrls} onChange={e => setImageUrls(e.target.value)} rows={3}
                placeholder="https://example.com/image1.jpg" className={inputCls} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <SelectField label="Resolution" value={resolution} onChange={setResolution} options={RESOLUTIONS} />
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Duration ({duration}s)</label>
              <input type="range" min={MIN_DUR} max={MAX_DUR} value={duration}
                onChange={e => setDuration(Number(e.target.value))} className="w-full accent-violet-500" />
            </div>
            {genType === 'text' && <SelectField label="Aspect Ratio" value={aspectRatio} onChange={setAspectRatio} options={ASPECT_RATIOS} />}
          </div>
          <Button onClick={handleGenerate} disabled={generating || (genType === 'text' && !prompt.trim())} className="w-full">
            {generating ? <Loader variant="inline" label="Generating..." /> : genType === 'text' ? 'Generate Video' : 'Animate Images'}
          </Button>
        </div>
      )}

      {tab === 'gallery' && (
        videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <p className="text-lg mb-2">No videos yet</p>
            <p className="text-sm">Generate your first video from the Generate tab.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">{videos.length} video(s)</span>
              <Button variant="outline" size="sm" onClick={loadData}>Refresh</Button>
            </div>
            <div className="grid gap-3">
              {videos.map(v => <VideoCard key={v.id} video={v} onDelete={handleDelete} />)}
            </div>
          </div>
        )
      )}

      {tab === 'settings' && <SettingsTab config={config} onRefresh={loadData} />}
    </div>
  )
}

// --- Video Card ---

function VideoCard({ video, onDelete }: { readonly video: VideoRecord; readonly onDelete: (id: string) => void }): React.ReactElement {
  const color = video.status === 'completed' ? 'text-emerald-400' : video.status === 'queued' ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-zinc-200 line-clamp-2 flex-1">{video.prompt || '(no prompt)'}</p>
        <span className={`text-xs font-medium ${color} whitespace-nowrap`}>{video.status}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
        <span>{video.generation_type}</span><span>{video.resolution}</span>
        <span>{video.duration}s</span><span>{video.aspect_ratio}</span>
        {video.credits_used > 0 && <span>{video.credits_used} credits</span>}
      </div>
      {video.video_url && (
        <video src={video.video_url} controls className="w-full rounded-md max-h-48 bg-black" poster={video.thumbnail_url ?? undefined} />
      )}
      {video.error && <p className="text-xs text-red-400">{video.error}</p>}
      <div className="flex justify-between items-center">
        <span className="text-xs text-zinc-600">{new Date(video.created_at).toLocaleString()}</span>
        <Button variant="outline" size="sm" onClick={() => onDelete(video.id)} className="text-red-400 hover:text-red-300">Delete</Button>
      </div>
    </div>
  )
}

// --- Settings Tab ---

function SettingsTab({ config, onRefresh }: { readonly config: NanobananaConfig | null; readonly onRefresh: () => void }): React.ReactElement {
  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
        <p className="text-sm">Unable to load configuration.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRefresh}>Retry</Button>
      </div>
    )
  }
  const color = config.api_status === 'connected' ? 'text-emerald-400' : config.api_status === 'invalid_key' ? 'text-red-400' : 'text-amber-400'
  return (
    <div className="space-y-4">
      <CfgSection title="API Configuration">
        <KV label="API Key" value={config.has_api_key ? 'Configured' : 'Not set'} />
        <KV label="Status" value={config.api_status} cls={color} />
        <KV label="Endpoint" value={config.base_url} cls="text-zinc-300 text-xs break-all" />
      </CfgSection>
      {config.credits && (
        <CfgSection title="Credits">
          <KV label="Remaining" value={String(config.credits.credits_remaining)} cls="text-emerald-400" />
          <KV label="Used" value={String(config.credits.credits_used)} />
        </CfgSection>
      )}
      <CfgSection title="Local Statistics">
        <KV label="Total Videos" value={String(config.local_stats.total_videos)} />
        <KV label="Credits Used (all time)" value={String(config.local_stats.total_credits_used)} />
      </CfgSection>
      <Button variant="outline" size="sm" onClick={onRefresh}>Refresh Config</Button>
    </div>
  )
}

// --- Shared micro-components ---

function CfgSection({ title, children }: { readonly title: string; readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
      <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
      <div className="grid grid-cols-2 gap-y-2 text-sm">{children}</div>
    </div>
  )
}

function KV({ label, value, cls }: { readonly label: string; readonly value: string; readonly cls?: string }): React.ReactElement {
  return (<><span className="text-zinc-400">{label}</span><span className={cls ?? 'text-zinc-200'}>{value}</span></>)
}

function SelectField({ label, value, onChange, options }: {
  readonly label: string; readonly value: string; readonly onChange: (v: string) => void; readonly options: readonly string[]
}): React.ReactElement {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
