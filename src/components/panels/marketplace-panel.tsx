'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import {
  PluginCard,
  TemplateCard,
  CommunityCard,
  PLUGIN_CATEGORIES,
  type MarketplacePlugin,
  type MarketplaceTemplate,
  type MarketplaceCommunityItem,
  type PluginCategory,
} from './marketplace-cards'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('Marketplace')

type MarketplaceTab = 'plugins' | 'templates' | 'community'

const TAB_LABELS: Record<MarketplaceTab, string> = {
  plugins: 'Plugins',
  templates: 'Templates',
  community: 'Community',
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchTabData<T>(
  tab: MarketplaceTab,
  category: string,
  query: string,
): Promise<T> {
  const params = new URLSearchParams({ tab })
  if (category && category !== 'all') params.set('category', category)
  if (query.trim()) params.set('q', query.trim())

  const res = await fetch(`/api/marketplace?${params.toString()}`, { cache: 'no-store' })
  const body = await res.json()

  if (!res.ok) {
    throw new Error(body?.error || 'Failed to load marketplace data')
  }
  log.debug(`Fetched ${tab} data`, { category, query })
  return body as T
}

async function postAction(
  action: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/marketplace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error || 'Action failed')
  log.debug(`Action ${action} succeeded`, payload)
  return body
}

async function deletePlugin(pluginId: number): Promise<{ message: string }> {
  const res = await fetch('/api/marketplace', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pluginId }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error || 'Uninstall failed')
  log.debug('Plugin uninstalled', { pluginId })
  return body
}

// ---------------------------------------------------------------------------
// Search input component
// ---------------------------------------------------------------------------

function SearchInput({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-border bg-secondary/50 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground text-xs"
          title="Clear"
        >
          x
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function MarketplacePanel() {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('plugins')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PluginCategory>('all')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Data state -- each tab has its own array
  const [plugins, setPlugins] = useState<readonly MarketplacePlugin[]>([])
  const [templates, setTemplates] = useState<readonly MarketplaceTemplate[]>([])
  const [communityItems, setCommunityItems] = useState<readonly MarketplaceCommunityItem[]>([])

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async (opts?: { silent?: boolean }): Promise<void> => {
    if (!opts?.silent) setLoading(true)
    setError(null)

    try {
      if (activeTab === 'plugins') {
        const data = await fetchTabData<{ plugins: MarketplacePlugin[] }>('plugins', category, query)
        setPlugins(data.plugins)
      } else if (activeTab === 'templates') {
        const data = await fetchTabData<{ templates: MarketplaceTemplate[] }>('templates', category, query)
        setTemplates(data.templates)
      } else {
        const data = await fetchTabData<{ items: MarketplaceCommunityItem[] }>('community', '', query)
        setCommunityItems(data.items)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load data'
      log.error('Failed to load marketplace data', { tab: activeTab, error: message })
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [activeTab, category, query])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleInstallPlugin = useCallback(async (id: number): Promise<void> => {
    setActionLoading(id)
    setFeedback(null)
    try {
      const result = await postAction('install_plugin', { pluginId: id })
      setFeedback(result.message)
      await loadData({ silent: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Install failed'
      log.error('Plugin install failed', { id, error: message })
      setFeedback(message)
    } finally {
      setActionLoading(null)
    }
  }, [loadData])

  const handleUninstallPlugin = useCallback(async (id: number): Promise<void> => {
    setActionLoading(id)
    setFeedback(null)
    try {
      const result = await deletePlugin(id)
      setFeedback(result.message)
      await loadData({ silent: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Uninstall failed'
      log.error('Plugin uninstall failed', { id, error: message })
      setFeedback(message)
    } finally {
      setActionLoading(null)
    }
  }, [loadData])

  const handleUseTemplate = useCallback(async (id: number): Promise<void> => {
    setActionLoading(id)
    setFeedback(null)
    try {
      const result = await postAction('use_template', { templateId: id })
      setFeedback(result.message)
      await loadData({ silent: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deploy failed'
      log.error('Template deploy failed', { id, error: message })
      setFeedback(message)
    } finally {
      setActionLoading(null)
    }
  }, [loadData])

  const handleImportCommunity = useCallback(async (id: number): Promise<void> => {
    setActionLoading(id)
    setFeedback(null)
    try {
      const result = await postAction('import_community', { itemId: id })
      setFeedback(result.message)
      await loadData({ silent: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed'
      log.error('Community import failed', { id, error: message })
      setFeedback(message)
    } finally {
      setActionLoading(null)
    }
  }, [loadData])

  // ---------------------------------------------------------------------------
  // Memoized counts for empty-state checks
  // ---------------------------------------------------------------------------

  const itemCount = useMemo((): number => {
    if (activeTab === 'plugins') return plugins.length
    if (activeTab === 'templates') return templates.length
    return communityItems.length
  }, [activeTab, plugins, templates, communityItems])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Marketplace</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Browse plugins, agent templates, and community extensions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(Object.keys(TAB_LABELS) as MarketplaceTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setQuery(''); setCategory('all') }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className="rounded-lg border px-4 py-2 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
          {feedback}
          <button onClick={() => setFeedback(null)} className="ml-2 text-muted-foreground hover:text-foreground">x</button>
        </div>
      )}

      {/* Search + category filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={`Search ${activeTab}...`}
          />
        </div>
        {activeTab === 'plugins' && (
          <div className="flex items-center gap-1.5">
            {PLUGIN_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-2.5 py-1 text-2xs rounded-md transition-colors capitalize ${
                  category === cat
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
        <Button variant="outline" size="xs" onClick={() => loadData()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <Loader variant="panel" label={`Loading ${activeTab}...`} />
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-sm text-destructive">
          {error}
        </div>
      ) : itemCount === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {query ? `No ${activeTab} matching "${query}".` : `No ${activeTab} available yet.`}
        </div>
      ) : (
        <>
          {activeTab === 'plugins' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {plugins.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  actionLoading={actionLoading}
                  onInstall={handleInstallPlugin}
                  onUninstall={handleUninstallPlugin}
                />
              ))}
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  actionLoading={actionLoading}
                  onUse={handleUseTemplate}
                />
              ))}
            </div>
          )}

          {activeTab === 'community' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {communityItems.map((item) => (
                <CommunityCard
                  key={item.id}
                  item={item}
                  actionLoading={actionLoading}
                  onImport={handleImportCommunity}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
