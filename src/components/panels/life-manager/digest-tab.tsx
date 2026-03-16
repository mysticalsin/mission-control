'use client'

import { Button } from '@/components/ui/button'
import { createClientLogger } from '@/lib/client-logger'
import type { Digest, DigestContent } from './types'

const log = createClientLogger('LifeDigest')

// ── Helpers ─────────────────────────────────────────────────────────────

function parseDigestContent(raw: string): DigestContent {
  try {
    return JSON.parse(raw) as DigestContent
  } catch {
    return { summary: raw }
  }
}

function formatGeneratedAt(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Section Card ────────────────────────────────────────────────────────

function DigestSection({
  title,
  icon,
  children,
}: {
  readonly title: string
  readonly icon: string
  readonly children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="bg-secondary/50 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {icon} {title}
      </h4>
      {children}
    </div>
  )
}

// ── Digest Card ─────────────────────────────────────────────────────────

function DigestCard({
  digest,
}: {
  readonly digest: Digest
}): React.ReactElement {
  const content = parseDigestContent(digest.content_json)

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground capitalize">
          {digest.digest_type} Brief
        </h3>
        <span className="text-xs text-muted-foreground">
          {formatGeneratedAt(digest.generated_at)}
        </span>
      </div>

      {content.summary && (
        <p className="text-sm text-foreground">{content.summary}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {content.weather && (
          <DigestSection title="Weather" icon="sun">
            <p className="text-sm text-foreground">{content.weather}</p>
          </DigestSection>
        )}

        {content.priorities && content.priorities.length > 0 && (
          <DigestSection title="Priorities" icon="target">
            <ul className="space-y-1">
              {content.priorities.map((item, idx) => (
                <li key={idx} className="text-sm text-foreground flex items-start gap-1.5">
                  <span className="text-primary mt-0.5 shrink-0">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </DigestSection>
        )}

        {content.calendar && content.calendar.length > 0 && (
          <DigestSection title="Calendar" icon="calendar">
            <ul className="space-y-1">
              {content.calendar.map((item, idx) => (
                <li key={idx} className="text-sm text-foreground flex items-start gap-1.5">
                  <span className="text-blue-400 mt-0.5 shrink-0">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </DigestSection>
        )}

        {content.news && content.news.length > 0 && (
          <DigestSection title="News" icon="globe">
            <ul className="space-y-1">
              {content.news.map((item, idx) => (
                <li key={idx} className="text-sm text-foreground flex items-start gap-1.5">
                  <span className="text-green-400 mt-0.5 shrink-0">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </DigestSection>
        )}
      </div>
    </div>
  )
}

// ── Props ───────────────────────────────────────────────────────────────

interface DigestTabProps {
  readonly digests: readonly Digest[]
  readonly onAction: (
    method: string,
    body: Record<string, unknown>,
  ) => Promise<void>
}

// ── Main Component ──────────────────────────────────────────────────────

export function DigestTab({
  digests,
  onAction,
}: DigestTabProps): React.ReactElement {
  const latestDigest = digests.length > 0 ? digests[0] : null

  async function handleGenerate(digestType: string): Promise<void> {
    await onAction('POST', { action: 'generate_digest', digest_type: digestType })
  }

  return (
    <div className="space-y-4">
      {/* Generate buttons */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Generate:</span>
        <Button size="sm" variant="outline" onClick={() => handleGenerate('morning')}>
          Morning Brief
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleGenerate('evening')}>
          Evening Digest
        </Button>
      </div>

      {/* Latest digest */}
      {!latestDigest ? (
        <div className="text-center text-muted-foreground py-12">
          <p className="text-lg mb-2">No digests yet</p>
          <p className="text-sm">Generate your first morning brief or evening digest above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <DigestCard digest={latestDigest} />

          {/* Previous digests */}
          {digests.length > 1 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Previous Digests</h3>
              {digests.slice(1, 6).map(digest => (
                <div key={digest.id} className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground capitalize">
                      {digest.digest_type} Brief
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatGeneratedAt(digest.generated_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {parseDigestContent(digest.content_json).summary ?? 'No summary available'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
