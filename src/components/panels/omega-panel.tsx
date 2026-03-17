'use client'

import React, { useState } from 'react'
import { Loader } from '@/components/ui/loader'
import { Button } from '@/components/ui/button'
import { DashboardTab } from './omega/dashboard-tab'
import { ReportsTab } from './omega/reports-tab'
import { SourcesTab } from './omega/sources-tab'
import { ConfigTab } from './omega/config-tab'
import { ErrorState } from './omega/shared'
import type { OmegaTab } from './omega/types'

// ---------------------------------------------------------------------------
// Tab configuration — drives the tab bar and content routing
// ---------------------------------------------------------------------------

const TAB_CONFIG: readonly { readonly key: OmegaTab; readonly label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'reports', label: 'Intelligence Reports' },
  { key: 'sources', label: 'Data Sources' },
  { key: 'config', label: 'Configuration' },
]

// ---------------------------------------------------------------------------
// OmegaPanel — thin orchestrator delegating to per-tab components
// ---------------------------------------------------------------------------

export function OmegaPanel(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<OmegaTab>('dashboard')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Omega Intelligence System
            </h1>
            <p className="text-muted-foreground mt-1">
              Decision audit trail, agent authorization, and deterministic replay
            </p>
          </div>

          {/* Tab bar */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {TAB_CONFIG.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content — each child manages its own data fetching */}
      <TabContent
        activeTab={activeTab}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
        error={error}
        setError={setError}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// TabContent — routes to the correct sub-tab component
// ---------------------------------------------------------------------------

function TabContent({
  activeTab,
  isLoading,
  setIsLoading,
  error,
  setError,
}: {
  readonly activeTab: OmegaTab
  readonly isLoading: boolean
  readonly setIsLoading: (v: boolean) => void
  readonly error: string | null
  readonly setError: (v: string | null) => void
}): React.JSX.Element {
  const tabProps = { isLoading, setIsLoading, error, setError }

  switch (activeTab) {
    case 'dashboard':
      return <DashboardTab {...tabProps} />
    case 'reports':
      return <ReportsTab {...tabProps} />
    case 'sources':
      return <SourcesTab {...tabProps} />
    case 'config':
      return <ConfigTab {...tabProps} />
  }
}
