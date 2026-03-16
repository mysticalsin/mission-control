import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { readLimiter } from '@/lib/rate-limit'
import {
  queryOverviewMetrics, queryActivityTimeline,
  queryAgentMetrics, queryAgentStatusDistribution,
  queryTaskTimeline, queryTasksByPriority, queryTasksByStatus,
  queryAvgCompletionHours,
  queryCostTimeline, queryCostByDepartment, queryTotalCost,
  queryPerformanceTimeline,
  queryHeatmap, queryTopUsers, queryUsageSummary,
} from '@/lib/analytics-queries'

const VALID_TABS = new Set([
  'overview', 'agents', 'tasks', 'costs', 'performance', 'usage',
])
const VALID_PERIODS = new Set(['24h', '7d', '30d', '90d'])

/**
 * GET /api/analytics?tab=overview&period=7d
 *
 * Returns analytics data aggregated from agents, tasks, token_usage,
 * sessions, and activities tables. Gracefully handles missing tables.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const limited = readLimiter(request)
  if (limited) return limited

  const auth = requireRole(request, 'viewer')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') ?? 'overview'
  const period = searchParams.get('period') ?? '7d'

  if (!VALID_TABS.has(tab)) {
    return NextResponse.json(
      { error: `Invalid tab. Must be one of: ${[...VALID_TABS].join(', ')}` },
      { status: 400 }
    )
  }

  if (!VALID_PERIODS.has(period)) {
    return NextResponse.json(
      { error: `Invalid period. Must be one of: ${[...VALID_PERIODS].join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const db = getDatabase()
    const data = buildTabData(db, tab, period)

    return NextResponse.json({
      data,
      period,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/analytics failed')
    return NextResponse.json(
      { error: 'Failed to retrieve analytics data' },
      { status: 500 }
    )
  }
}

/**
 * Dispatch to the correct query builder based on the requested tab.
 * Each builder returns a plain object matching the corresponding
 * client-side TypeScript interface.
 */
function buildTabData(
  db: ReturnType<typeof getDatabase>,
  tab: string,
  period: string
): unknown {
  switch (tab) {
    case 'overview':
      return buildOverview(db, period)
    case 'agents':
      return buildAgents(db, period)
    case 'tasks':
      return buildTasks(db, period)
    case 'costs':
      return buildCosts(db, period)
    case 'performance':
      return buildPerformance(db, period)
    case 'usage':
      return buildUsage(db, period)
    default:
      return {}
  }
}

function buildOverview(db: ReturnType<typeof getDatabase>, period: string): unknown {
  return {
    metrics: queryOverviewMetrics(db, period),
    activityTimeline: queryActivityTimeline(db, period),
  }
}

function buildAgents(db: ReturnType<typeof getDatabase>, period: string): unknown {
  return {
    topAgents: queryAgentMetrics(db, period),
    statusDistribution: queryAgentStatusDistribution(db),
  }
}

function buildTasks(db: ReturnType<typeof getDatabase>, period: string): unknown {
  return {
    timeline: queryTaskTimeline(db, period),
    byPriority: queryTasksByPriority(db, period),
    byStatus: queryTasksByStatus(db, period),
    avgCompletionHours: queryAvgCompletionHours(db, period),
  }
}

function buildCosts(db: ReturnType<typeof getDatabase>, period: string): unknown {
  const { timeline, models } = queryCostTimeline(db, period)
  return {
    timeline,
    models,
    byDepartment: queryCostByDepartment(db, period),
    totalCost: queryTotalCost(db, period),
    budgetUsedPercent: 0, // No budget table yet; placeholder
  }
}

function buildPerformance(db: ReturnType<typeof getDatabase>, period: string): unknown {
  const timeline = queryPerformanceTimeline(db, period)
  const totalThroughput = timeline.reduce((sum, p) => sum + p.throughput, 0)
  const totalError = timeline.reduce((sum, p) => sum + p.errorRate, 0)
  const count = timeline.length || 1

  return {
    timeline,
    avgLatencyMs: 0, // Detailed latency requires instrumentation
    avgThroughput: totalThroughput / count,
    avgErrorRate: totalError / count,
  }
}

function buildUsage(db: ReturnType<typeof getDatabase>, period: string): unknown {
  const summary = queryUsageSummary(db, period)
  return {
    heatmap: queryHeatmap(db, period),
    topUsers: queryTopUsers(db, period),
    avgSessionMinutes: summary.avgSessionMinutes,
    peakHour: summary.peakHour,
    peakDay: summary.peakDay,
  }
}
