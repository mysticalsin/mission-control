'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'

// ── Shared Types (re-exported for use in healer-panel.tsx) ───────────────────

export interface HealerScan {
  id: number
  scan_type: 'full' | 'quick' | 'targeted'
  status: 'running' | 'completed' | 'failed'
  issues_found: number
  issues_fixed: number
  duration_ms: number
  report_json: string
  created_at: number
}

export interface HealerEvent {
  id: number
  event_type: string
  component: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
  metadata_json: string
  created_at: number
}

export interface CircuitBreakerState {
  service_name: string
  state: 'closed' | 'open' | 'half_open'
  failure_count: number
  trip_count: number
}

export interface HealerConfig {
  id: number
  component: string
  enabled: number
  threshold: number
  cooldown_seconds: number
  updated_at: number
}

export interface DashboardData {
  latestScan: HealerScan | null
  recentEvents: HealerEvent[]
  circuitBreakers: CircuitBreakerState[]
  overallStatus: 'healthy' | 'degraded' | 'down'
  degradedServices: string[]
  timestamp: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatTs(unix: number): string {
  return new Date(unix * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function SeverityBadge({ severity }: { severity: string }) {
  const cls: Record<string, string> = {
    info: 'bg-blue-500/10 text-blue-400',
    warning: 'bg-yellow-500/10 text-yellow-400',
    error: 'bg-red-500/10 text-red-400',
    critical: 'bg-red-700/20 text-red-300 font-semibold',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] ${cls[severity] ?? cls.info}`}>
      {severity}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'healthy' ? 'bg-green-500' :
    status === 'degraded' ? 'bg-yellow-500' :
    'bg-red-500'
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />
}

function CircuitBadge({ state }: { state: string }) {
  const cls =
    state === 'closed' ? 'bg-green-500/10 text-green-400' :
    state === 'open' ? 'bg-red-500/10 text-red-400' :
    'bg-yellow-500/10 text-yellow-400'
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{state}</span>
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

export function DashboardTab({
  data, onTriggerScan, isScanning,
}: {
  data: DashboardData | null
  onTriggerScan: (type: 'full' | 'quick') => void
  isScanning: boolean
}) {
  if (!data) return <Loader variant="panel" label="Loading dashboard" />
  const { latestScan, recentEvents, circuitBreakers, overallStatus, degradedServices } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-5 flex items-center gap-4">
          <StatusDot status={overallStatus} />
          <div>
            <div className="text-2xl font-bold text-foreground capitalize">{overallStatus}</div>
            <div className="text-xs text-muted-foreground">Overall Health</div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-2xl font-bold text-foreground">{circuitBreakers.length}</div>
          <div className="text-xs text-muted-foreground">Circuit Breakers</div>
          <div className="text-xs text-red-400 mt-1">
            {circuitBreakers.filter(cb => cb.state === 'open').length} open
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-2xl font-bold text-foreground">{degradedServices.length}</div>
          <div className="text-xs text-muted-foreground">Degraded Services</div>
          {degradedServices.length > 0 && (
            <div className="text-xs text-yellow-400 mt-1 truncate">{degradedServices.join(', ')}</div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Last Scan</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={isScanning} onClick={() => onTriggerScan('quick')}>
              {isScanning ? 'Scanning...' : 'Quick Scan'}
            </Button>
            <Button size="sm" disabled={isScanning} onClick={() => onTriggerScan('full')}>
              {isScanning ? 'Scanning...' : 'Full Scan'}
            </Button>
          </div>
        </div>
        {latestScan ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-muted-foreground">Type: </span><span className="capitalize">{latestScan.scan_type}</span></div>
            <div><span className="text-muted-foreground">Status: </span><span className="capitalize">{latestScan.status}</span></div>
            <div><span className="text-muted-foreground">Issues: </span><span className="text-red-400">{latestScan.issues_found}</span></div>
            <div><span className="text-muted-foreground">Time: </span>{formatTs(latestScan.created_at)}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No scans yet — trigger one above.</p>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-base font-semibold mb-3">Circuit Breakers</h2>
        {circuitBreakers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No circuit breakers registered.</p>
        ) : (
          <div className="space-y-2">
            {circuitBreakers.map(cb => (
              <div key={cb.service_name} className="flex items-center justify-between text-sm border border-border/50 rounded px-3 py-2">
                <span className="font-medium text-foreground">{cb.service_name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-xs">{cb.failure_count} failures · {cb.trip_count} trips</span>
                  <CircuitBadge state={cb.state} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-base font-semibold mb-3">Recent Events</h2>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No events recorded yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {recentEvents.map(ev => (
              <div key={ev.id} className="flex items-start gap-2 text-xs">
                <SeverityBadge severity={ev.severity} />
                <span className="text-muted-foreground shrink-0">{formatTs(ev.created_at)}</span>
                <span className="text-foreground">{ev.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Scans Tab ─────────────────────────────────────────────────────────────────

export function ScansTab({ scans, isLoading }: { scans: HealerScan[]; isLoading: boolean }) {
  if (isLoading) return <Loader variant="panel" label="Loading scans" />
  if (scans.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <p className="text-base mb-1">No scans recorded</p>
        <p className="text-sm">Trigger a scan from the Dashboard tab.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {scans.map(scan => (
        <div key={scan.id} className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="capitalize font-medium text-foreground">{scan.scan_type} scan</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                scan.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                scan.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                'bg-yellow-500/10 text-yellow-400'
              }`}>{scan.status}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatTs(scan.created_at)}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2 text-xs text-muted-foreground">
            <span><span className="text-foreground font-medium">{scan.issues_found}</span> found</span>
            <span><span className="text-foreground font-medium">{scan.issues_fixed}</span> fixed</span>
            <span><span className="text-foreground font-medium">{scan.duration_ms}ms</span> duration</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Events Tab ────────────────────────────────────────────────────────────────

export function EventsTab({ events, isLoading }: { events: HealerEvent[]; isLoading: boolean }) {
  const [componentFilter, setComponentFilter] = useState('')
  const components = [...new Set(events.map(e => e.component).filter(Boolean))]
  const filtered = componentFilter ? events.filter(e => e.component === componentFilter) : events

  if (isLoading) return <Loader variant="panel" label="Loading events" />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <button
          onClick={() => setComponentFilter('')}
          className={`px-2 py-1 text-xs rounded ${!componentFilter ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
        >All</button>
        {components.map(c => (
          <button key={c} onClick={() => setComponentFilter(c)}
            className={`px-2 py-1 text-xs rounded ${componentFilter === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
          >{c}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <p className="text-base mb-1">No events</p>
          <p className="text-sm">Events appear as the self-healing engine operates.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(ev => (
            <div key={ev.id} className="bg-card border border-border rounded px-4 py-2.5 flex items-start gap-3 text-sm">
              <SeverityBadge severity={ev.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">{ev.message}</span>
                  {ev.component && <span className="text-xs text-muted-foreground shrink-0">· {ev.component}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{ev.event_type} · {formatTs(ev.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Config Tab ────────────────────────────────────────────────────────────────

export function ConfigTab({
  configs, isLoading, onUpdate,
}: {
  configs: HealerConfig[]
  isLoading: boolean
  onUpdate: (component: string, patch: { enabled?: boolean; threshold?: number; cooldown_seconds?: number }) => Promise<void>
}) {
  if (isLoading) return <Loader variant="panel" label="Loading config" />
  if (configs.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <p className="text-base mb-1">No config entries</p>
        <p className="text-sm">Config entries appear once components are registered.</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {configs.map(cfg => (
        <div key={cfg.id} className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-foreground">{cfg.component}</span>
            <Button
              size="sm"
              variant={cfg.enabled ? 'default' : 'secondary'}
              onClick={() => onUpdate(cfg.component, { enabled: !cfg.enabled })}
            >{cfg.enabled ? 'Enabled' : 'Disabled'}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
            <div>Threshold: <span className="text-foreground">{cfg.threshold} failures</span></div>
            <div>Cooldown: <span className="text-foreground">{cfg.cooldown_seconds}s</span></div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">Updated: {formatTs(cfg.updated_at)}</div>
        </div>
      ))}
    </div>
  )
}
