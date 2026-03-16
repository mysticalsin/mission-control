'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  DashboardTab,
  ScansTab,
  EventsTab,
  ConfigTab,
  type DashboardData,
  type HealerScan,
  type HealerEvent,
  type HealerConfig,
} from './healer-panel-tabs'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'scans' | 'events' | 'config'

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'scans', label: 'Scans' },
  { key: 'events', label: 'Events' },
  { key: 'config', label: 'Config' },
]

// ── Main Panel ────────────────────────────────────────────────────────────────

export function HealerPanel() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [scans, setScans] = useState<HealerScan[]>([])
  const [events, setEvents] = useState<HealerEvent[]>([])
  const [configs, setConfigs] = useState<HealerConfig[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  const fetchTab = useCallback(async (t: Tab): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/healer?tab=${t}`)
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json() as Record<string, unknown>

      if (t === 'dashboard') setDashboard(data as unknown as DashboardData)
      else if (t === 'scans') setScans((data.scans as HealerScan[]) ?? [])
      else if (t === 'events') setEvents((data.events as HealerEvent[]) ?? [])
      else if (t === 'config') setConfigs((data.configs as HealerConfig[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void fetchTab(tab) }, [tab, fetchTab])

  const handleTriggerScan = async (scanType: 'full' | 'quick'): Promise<void> => {
    setIsScanning(true)
    try {
      const res = await fetch('/api/healer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_scan', scan_type: scanType }),
      })
      if (!res.ok) throw new Error('Scan request failed')
      await fetchTab('dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setIsScanning(false)
    }
  }

  const handleConfigUpdate = async (
    component: string,
    patch: { enabled?: boolean; threshold?: number; cooldown_seconds?: number },
  ): Promise<void> => {
    try {
      const res = await fetch('/api/healer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, ...patch }),
      })
      if (!res.ok) throw new Error('Config update failed')
      await fetchTab('config')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Self-Healer</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Circuit breakers, health scans, and auto-recovery monitoring
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => fetchTab(tab)}>Refresh</Button>
      </div>

      {/* Tab nav */}
      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >{label}</button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Tab content */}
      {tab === 'dashboard' && (
        <DashboardTab
          data={dashboard}
          onTriggerScan={handleTriggerScan}
          isScanning={isScanning}
        />
      )}
      {tab === 'scans' && <ScansTab scans={scans} isLoading={isLoading} />}
      {tab === 'events' && <EventsTab events={events} isLoading={isLoading} />}
      {tab === 'config' && (
        <ConfigTab configs={configs} isLoading={isLoading} onUpdate={handleConfigUpdate} />
      )}
    </div>
  )
}
