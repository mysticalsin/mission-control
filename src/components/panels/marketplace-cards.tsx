'use client'

import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface MarketplacePlugin {
  readonly id: number
  readonly name: string
  readonly description: string
  readonly author: string
  readonly version: string
  readonly category: string
  readonly icon_url: string
  readonly install_count: number
  readonly rating: number
  readonly status: string
}

export interface MarketplaceTemplate {
  readonly id: number
  readonly name: string
  readonly description: string
  readonly category: string
  readonly agent_count: number
  readonly downloads: number
}

export interface MarketplaceCommunityItem {
  readonly id: number
  readonly name: string
  readonly description: string
  readonly author: string
  readonly type: string
  readonly likes: number
  readonly downloads: number
}

export type PluginCategory = 'all' | 'automation' | 'analytics' | 'integration' | 'security' | 'ui'

export const PLUGIN_CATEGORIES: readonly PluginCategory[] = [
  'all', 'automation', 'analytics', 'integration', 'security', 'ui',
] as const

// ---------------------------------------------------------------------------
// Category badge colors
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  automation: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  analytics: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  integration: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  security: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  ui: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  support: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  engineering: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  general: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
}

function categoryBadgeClass(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.general
}

// ---------------------------------------------------------------------------
// Star rating
// ---------------------------------------------------------------------------

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const hasHalf = rating - full >= 0.3

  return (
    <div className="flex items-center gap-0.5" title={`${rating.toFixed(1)} stars`}>
      {Array.from({ length: 5 }, (_, i) => {
        if (i < full) return <Star key={i} fill="full" />
        if (i === full && hasHalf) return <Star key={i} fill="half" />
        return <Star key={i} fill="empty" />
      })}
      <span className="ml-1 text-2xs text-muted-foreground">{rating.toFixed(1)}</span>
    </div>
  )
}

function Star({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  const cls = fill === 'full'
    ? 'text-amber-400'
    : fill === 'half'
      ? 'text-amber-400/50'
      : 'text-muted-foreground/20'

  return (
    <svg className={`w-3 h-3 ${cls}`} viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Status badge for plugins
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'installed'
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : status === 'update-available'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-secondary/50 text-muted-foreground border-border'

  return (
    <span className={`text-2xs rounded-full border px-2 py-0.5 ${cls}`}>
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Plugin card
// ---------------------------------------------------------------------------

interface PluginCardProps {
  readonly plugin: MarketplacePlugin
  readonly actionLoading: number | null
  readonly onInstall: (id: number) => void
  readonly onUninstall: (id: number) => void
}

export function PluginCard({ plugin, actionLoading, onInstall, onUninstall }: PluginCardProps) {
  const isLoading = actionLoading === plugin.id
  const isInstalled = plugin.status === 'installed'

  return (
    <div className="group rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/50 text-lg">
            {plugin.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-medium text-foreground truncate">{plugin.name}</h4>
            <p className="text-2xs text-muted-foreground">
              by {plugin.author} &middot; v{plugin.version}
            </p>
          </div>
        </div>
        <StatusBadge status={plugin.status} />
      </div>

      <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {plugin.description}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-2xs rounded-full border px-2 py-0.5 ${categoryBadgeClass(plugin.category)}`}>
            {plugin.category}
          </span>
          <span className="text-2xs text-muted-foreground">
            {plugin.install_count.toLocaleString()} installs
          </span>
        </div>
        <StarRating rating={plugin.rating} />
      </div>

      <div className="mt-3 flex justify-end">
        {isInstalled ? (
          <Button
            variant="destructive"
            size="xs"
            onClick={() => onUninstall(plugin.id)}
            disabled={isLoading}
          >
            {isLoading ? 'Removing...' : 'Uninstall'}
          </Button>
        ) : (
          <Button
            variant="default"
            size="xs"
            onClick={() => onInstall(plugin.id)}
            disabled={isLoading}
          >
            {isLoading ? 'Installing...' : 'Install'}
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

interface TemplateCardProps {
  readonly template: MarketplaceTemplate
  readonly actionLoading: number | null
  readonly onUse: (id: number) => void
}

export function TemplateCard({ template, actionLoading, onUse }: TemplateCardProps) {
  const isLoading = actionLoading === template.id

  return (
    <div className="group rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <h4 className="text-sm font-medium text-foreground">{template.name}</h4>
      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {template.description}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <span className={`text-2xs rounded-full border px-2 py-0.5 ${categoryBadgeClass(template.category)}`}>
          {template.category}
        </span>
        <span className="text-2xs text-muted-foreground">
          {template.agent_count} agent{template.agent_count !== 1 ? 's' : ''}
        </span>
        <span className="text-2xs text-muted-foreground">
          {template.downloads.toLocaleString()} downloads
        </span>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="default"
          size="xs"
          onClick={() => onUse(template.id)}
          disabled={isLoading}
        >
          {isLoading ? 'Deploying...' : 'Use Template'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Community card
// ---------------------------------------------------------------------------

interface CommunityCardProps {
  readonly item: MarketplaceCommunityItem
  readonly actionLoading: number | null
  readonly onImport: (id: number) => void
}

export function CommunityCard({ item, actionLoading, onImport }: CommunityCardProps) {
  const isLoading = actionLoading === item.id

  return (
    <div className="group rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-foreground truncate">{item.name}</h4>
          <p className="text-2xs text-muted-foreground">by {item.author}</p>
        </div>
        <span className={`text-2xs rounded-full border px-2 py-0.5 shrink-0 ${categoryBadgeClass(item.type)}`}>
          {item.type}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {item.description}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-2xs text-muted-foreground">
          <span>{item.likes} likes</span>
          <span>{item.downloads.toLocaleString()} downloads</span>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={() => onImport(item.id)}
          disabled={isLoading}
        >
          {isLoading ? 'Importing...' : 'Import'}
        </Button>
      </div>
    </div>
  )
}
