'use client'

import React from 'react'

import { Button } from '@/components/ui/button'
import type { IntelEntry } from '../trading-panel'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('TradingIntel')

// -- Constants --

const SENTIMENT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  bullish:  { bg: 'bg-[#10B981]/10', text: 'text-[#10B981]', label: 'Bullish' },
  bearish:  { bg: 'bg-[#EF4444]/10', text: 'text-[#EF4444]', label: 'Bearish' },
  neutral:  { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', label: 'Neutral' },
}

// -- Helpers --

function parseSources(sourcesJson: string): readonly string[] {
  try {
    const parsed = JSON.parse(sourcesJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// -- Component --

interface IntelViewProps {
  readonly entries: readonly IntelEntry[]
  readonly onRefresh: () => void
}

export function IntelView({ entries, onRefresh }: IntelViewProps): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <div className="text-lg mb-2">No intelligence data</div>
        <div className="text-sm max-w-sm mx-auto">
          AI-generated market insights and sentiment analysis will appear here once intel is collected.
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm" className="mt-4">
          Refresh
        </Button>
      </div>
    )
  }

  // Aggregate sentiment stats
  const sentimentCounts = { bullish: 0, bearish: 0, neutral: 0 }
  let totalConfidence = 0
  for (const entry of entries) {
    sentimentCounts[entry.sentiment] += 1
    totalConfidence += entry.confidence
  }
  const avgConfidence = entries.length > 0 ? Math.round(totalConfidence / entries.length) : 0

  return (
    <div className="space-y-6">
      <SentimentSummary
        counts={sentimentCounts}
        avgConfidence={avgConfidence}
        totalEntries={entries.length}
      />
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Intelligence Feed</h2>
        {entries.map(entry => (
          <IntelCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}

// -- Sentiment Summary --

function SentimentSummary({
  counts,
  avgConfidence,
  totalEntries,
}: {
  readonly counts: Record<string, number>
  readonly avgConfidence: number
  readonly totalEntries: number
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-3xl font-bold text-[#10B981]">{counts.bullish}</div>
        <div className="text-sm text-muted-foreground">Bullish Signals</div>
      </div>
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-3xl font-bold text-[#EF4444]">{counts.bearish}</div>
        <div className="text-sm text-muted-foreground">Bearish Signals</div>
      </div>
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-3xl font-bold text-[#F59E0B]">{counts.neutral}</div>
        <div className="text-sm text-muted-foreground">Neutral Signals</div>
      </div>
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="text-3xl font-bold text-foreground">{avgConfidence}%</div>
        <div className="text-sm text-muted-foreground">
          Avg Confidence ({totalEntries} total)
        </div>
      </div>
    </div>
  )
}

// -- Intel Card --

function IntelCard({ entry }: { readonly entry: IntelEntry }): React.JSX.Element {
  const style = SENTIMENT_STYLES[entry.sentiment] ?? SENTIMENT_STYLES.neutral
  const sources = parseSources(entry.sources_json)

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-lg text-foreground">{entry.symbol}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
            {style.label}
          </span>
          <ConfidenceBar confidence={entry.confidence} />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatTimestamp(entry.created_at)}
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
        {entry.reasoning}
      </p>

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sources.map((source, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-secondary text-muted-foreground border border-border/50"
            >
              {source}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// -- Confidence Bar --

function ConfidenceBar({ confidence }: { readonly confidence: number }): React.JSX.Element {
  // Color shifts based on confidence level
  const barColor = confidence >= 75
    ? 'bg-[#10B981]'
    : confidence >= 50
      ? 'bg-[#F59E0B]'
      : 'bg-[#EF4444]'

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-secondary rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${barColor}`}
          style={{ width: `${Math.min(confidence, 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{confidence}%</span>
    </div>
  )
}
