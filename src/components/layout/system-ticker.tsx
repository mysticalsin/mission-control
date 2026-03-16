'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useNavigateToPanel } from '@/lib/navigation'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('SystemTicker')

// --- Types ---

interface TickerMetrics {
  readonly agents: { readonly total: number; readonly active: number }
  readonly sessions: { readonly total: number }
  readonly tasks: { readonly pending: number; readonly completed: number }
  readonly memory: { readonly usedGb: number; readonly totalGb: number }
  readonly uptime: number
  readonly eventRate: number
  readonly health: 'healthy' | 'degraded' | 'unhealthy'
}

interface ApiStatusResponse {
  readonly timestamp?: number
  readonly uptime?: number
  readonly memory?: { readonly total: number; readonly used: number }
  readonly sessions?: { readonly total: number; readonly active: number }
  readonly db?: {
    readonly agents?: { readonly total: number; readonly byStatus: Record<string, number> }
    readonly tasks?: { readonly total: number; readonly byStatus: Record<string, number> }
    readonly audit?: { readonly day: number }
  } | null
}

const POLL_INTERVAL_MS = 10_000
const FALLBACK_METRICS: TickerMetrics = {
  agents: { total: 0, active: 0 },
  sessions: { total: 0 },
  tasks: { pending: 0, completed: 0 },
  memory: { usedGb: 0, totalGb: 0 },
  uptime: 0,
  eventRate: 0,
  health: 'healthy',
}

// --- Helpers ---

function parseApiResponse(data: ApiStatusResponse): TickerMetrics {
  const agentsByStatus = data.db?.agents?.byStatus ?? {}
  const activeAgents = (agentsByStatus['active'] ?? 0) + (agentsByStatus['busy'] ?? 0)
  const totalAgents = data.db?.agents?.total ?? 0

  const tasksByStatus = data.db?.tasks?.byStatus ?? {}
  const pending = (tasksByStatus['pending'] ?? 0) + (tasksByStatus['in_progress'] ?? 0)
  const completed = tasksByStatus['completed'] ?? 0

  const totalMb = data.memory?.total ?? 0
  const usedMb = data.memory?.used ?? 0

  // Approximate events per minute from 24h audit count
  const auditDay = data.db?.audit?.day ?? 0
  const eventRate = auditDay > 0 ? Math.round(auditDay / 1440) : 0

  return {
    agents: { total: totalAgents, active: activeAgents },
    sessions: { total: data.sessions?.total ?? 0 },
    tasks: { pending, completed },
    memory: {
      usedGb: Math.round((usedMb / 1024) * 10) / 10,
      totalGb: Math.round((totalMb / 1024) * 10) / 10,
    },
    uptime: data.uptime ?? 0,
    eventRate,
    health: deriveHealth(data),
  }
}

function deriveHealth(data: ApiStatusResponse): TickerMetrics['health'] {
  if (!data.timestamp) return 'unhealthy'
  const usedPct = data.memory?.total
    ? (data.memory.used / data.memory.total) * 100
    : 0
  if (usedPct > 95) return 'unhealthy'
  if (usedPct > 85) return 'degraded'
  return 'healthy'
}

function formatUptime(ms: number): string {
  if (ms <= 0) return '0m'
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  return parts.join(' ')
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// --- Hooks ---

function useTickerPolling(): { metrics: TickerMetrics; isStale: boolean } {
  const [metrics, setMetrics] = useState<TickerMetrics>(FALLBACK_METRICS)
  const [isStale, setIsStale] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSuccessRef = useRef<TickerMetrics>(FALLBACK_METRICS)

  const fetchMetrics = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/status?action=dashboard')
      if (!response.ok) {
        setIsStale(true)
        return
      }
      const data: ApiStatusResponse = await response.json()
      const parsed = parseApiResponse(data)
      lastSuccessRef.current = parsed
      setMetrics(parsed)
      setIsStale(false)
      log.debug('Ticker metrics updated', { health: parsed.health, agents: parsed.agents.total })
    } catch (err: unknown) {
      // API unreachable: retain last known values, flag stale
      log.error('Ticker fetch failed', { error: err instanceof Error ? err.message : 'unknown' })
      setMetrics(lastSuccessRef.current)
      setIsStale(true)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
    intervalRef.current = setInterval(fetchMetrics, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchMetrics])

  return { metrics, isStale }
}

function useClock(): string {
  const [time, setTime] = useState(() => formatTime(new Date()))
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 1_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return time
}

// --- Sub-components ---

const HEALTH_COLORS: Record<TickerMetrics['health'], string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500 animate-pulse',
  unhealthy: 'bg-red-500 animate-pulse',
}

function HealthDot({ health }: { readonly health: TickerMetrics['health'] }): ReactNode {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${HEALTH_COLORS[health]}`}
      title={`System ${health}`}
      aria-label={`System health: ${health}`}
    />
  )
}

function MetricButton({
  panel,
  children,
  onClick,
}: {
  readonly panel: string
  readonly children: ReactNode
  readonly onClick: (panel: string) => void
}): ReactNode {
  return (
    <button
      onClick={() => onClick(panel)}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground whitespace-nowrap"
      title={`Go to ${panel}`}
    >
      {children}
    </button>
  )
}

function Separator(): ReactNode {
  return <span className="text-border select-none" aria-hidden="true">|</span>
}

// --- Main Component ---

export function SystemTicker(): ReactNode {
  const { metrics, isStale } = useTickerPolling()
  const clock = useClock()
  const navigateToPanel = useNavigateToPanel()

  const handleNavigate = useCallback(
    (panel: string) => { navigateToPanel(panel) },
    [navigateToPanel],
  )

  return (
    <footer
      role="contentinfo"
      aria-label="System telemetry"
      className="fixed bottom-0 left-0 right-0 z-40 h-7 bg-card/80 backdrop-blur border-t border-border flex items-center px-3 gap-2 text-[10px] font-mono select-none overflow-x-auto"
    >
      <HealthDot health={metrics.health} />

      {isStale && (
        <span
          className="text-yellow-500 text-[10px] font-sans"
          title="Showing last known values; API unreachable"
        >
          STALE
        </span>
      )}

      <MetricButton panel="agents" onClick={handleNavigate}>
        <span className="font-mono transition-all duration-300">
          {metrics.agents.total} agents
        </span>
        <span className="text-muted-foreground/60">|</span>
        <span className="font-mono text-green-400 transition-all duration-300">
          {metrics.agents.active} active
        </span>
      </MetricButton>

      <Separator />

      <MetricButton panel="chat" onClick={handleNavigate}>
        <span className="font-mono transition-all duration-300">
          {metrics.sessions.total} sessions
        </span>
      </MetricButton>

      <Separator />

      <MetricButton panel="tasks" onClick={handleNavigate}>
        <span className="font-mono text-amber-400 transition-all duration-300">
          {metrics.tasks.pending} pending
        </span>
        <span className="text-muted-foreground/60">|</span>
        <span className="font-mono text-green-400 transition-all duration-300">
          {metrics.tasks.completed} completed
        </span>
      </MetricButton>

      <Separator />

      <MetricButton panel="overview" onClick={handleNavigate}>
        <span className="font-mono transition-all duration-300">
          {metrics.memory.usedGb}GB / {metrics.memory.totalGb}GB
        </span>
      </MetricButton>

      <Separator />

      <MetricButton panel="overview" onClick={handleNavigate}>
        <span className="font-mono transition-all duration-300">
          {formatUptime(metrics.uptime)}
        </span>
      </MetricButton>

      <Separator />

      <MetricButton panel="activity" onClick={handleNavigate}>
        <span className="font-mono transition-all duration-300">
          {metrics.eventRate} events/min
        </span>
      </MetricButton>

      <Separator />

      <span className="font-mono text-muted-foreground/80 ml-auto shrink-0 tabular-nums">
        {clock}
      </span>
    </footer>
  )
}
