'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('WebPanel')

interface EngineStatus {
  readonly name: string
  readonly status: 'online' | 'offline' | 'degraded'
  readonly latency_ms?: number
}

interface CrawlResult {
  readonly url: string
  readonly title?: string
  readonly content?: string
  readonly status: number
}

export function WebPanel(): React.JSX.Element {
  const [engines, setEngines] = useState<readonly EngineStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null)
  const [isCrawling, setIsCrawling] = useState(false)

  const loadEngines = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/web')
      if (!res.ok) throw new Error('Failed to load web engines')
      const json = await res.json()
      setEngines(json.engines ?? (Array.isArray(json) ? json : []))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      log.error({ err }, 'Failed to load web engines')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadEngines() }, [loadEngines])

  const handleCrawl = useCallback(async (): Promise<void> => {
    if (!crawlUrl.trim()) return
    setIsCrawling(true)
    setCrawlResult(null)
    try {
      const res = await fetch('/api/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: crawlUrl }),
      })
      if (!res.ok) throw new Error('Crawl request failed')
      const json = await res.json()
      setCrawlResult(json as CrawlResult)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      log.error({ err }, 'Crawl failed')
    } finally {
      setIsCrawling(false)
    }
  }, [crawlUrl])

  const statusColor = (s: EngineStatus['status']): string => {
    if (s === 'online') return 'bg-[#10B981]'
    if (s === 'degraded') return 'bg-[#F59E0B]'
    return 'bg-[#EF4444]'
  }

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Web Crawler</h1>
            <p className="text-muted-foreground mt-1">Search engines status and URL crawling</p>
          </div>
          <Button onClick={loadEngines} variant="secondary" size="sm">Refresh</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={crawlUrl}
          onChange={e => setCrawlUrl(e.target.value)}
          placeholder="Enter URL to crawl..."
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button onClick={handleCrawl} disabled={isCrawling || !crawlUrl.trim()} size="sm">
          {isCrawling ? 'Crawling...' : 'Crawl'}
        </Button>
      </div>

      {crawlResult && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">{crawlResult.title ?? crawlResult.url}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{crawlResult.content?.slice(0, 500)}</p>
        </div>
      )}

      {error ? (
        <div className="text-center py-12">
          <p className="text-[#EF4444] text-lg mb-2">Failed to load engines</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <Button onClick={loadEngines} variant="outline" size="sm">Retry</Button>
        </div>
      ) : isLoading ? (
        <Loader variant="panel" label="Loading engines" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {engines.map(engine => (
            <div key={engine.name} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${statusColor(engine.status)}`} />
                <p className="text-sm font-medium text-foreground">{engine.name}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {engine.latency_ms != null ? `${engine.latency_ms}ms` : engine.status}
              </p>
            </div>
          ))}
          {engines.length === 0 && (
            <p className="text-muted-foreground col-span-full text-center py-8">No engines configured</p>
          )}
        </div>
      )}
    </div>
  )
}
