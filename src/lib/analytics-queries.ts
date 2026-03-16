import type Database from 'better-sqlite3'

// -- Period helpers --

const PERIOD_SECONDS: Record<string, number> = {
  '24h': 86_400,
  '7d': 604_800,
  '30d': 2_592_000,
  '90d': 7_776_000,
}

function periodCutoff(period: string): number {
  const seconds = PERIOD_SECONDS[period] ?? PERIOD_SECONDS['7d']
  return Math.floor(Date.now() / 1000) - seconds
}

/**
 * Safe query runner: returns empty array if table does not exist.
 * Prevents crashes when optional tables are not yet migrated.
 */
function safeAll<T>(db: Database.Database, sql: string, params: unknown[] = []): T[] {
  try {
    return db.prepare(sql).all(...params) as T[]
  } catch {
    return []
  }
}

function safeGet<T>(db: Database.Database, sql: string, params: unknown[] = []): T | undefined {
  try {
    return db.prepare(sql).get(...params) as T | undefined
  } catch {
    return undefined
  }
}

// -- Overview queries --

interface OverviewMetricsRow {
  totalAgents: number
  activeAgents: number
}

interface SessionCountRow {
  activeSessions: number
}

interface TaskCountsRow {
  total: number
  completed: number
}

export function queryOverviewMetrics(db: Database.Database, period: string): {
  totalAgents: number
  activeAgents: number
  activeSessions: number
  tasksCompleted: number
  totalTasks: number
  uptimePercent: number
} {
  const cutoff = periodCutoff(period)

  const agents = safeGet<OverviewMetricsRow>(db,
    `SELECT COUNT(id) as totalAgents,
            SUM(CASE WHEN status IN ('idle','busy') THEN 1 ELSE 0 END) as activeAgents
     FROM agents`
  )

  const sessions = safeGet<SessionCountRow>(db,
    `SELECT COUNT(id) as activeSessions FROM sessions WHERE active = 1`
  )

  const tasks = safeGet<TaskCountsRow>(db,
    `SELECT COUNT(id) as total,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed
     FROM tasks WHERE created_at >= ?`,
    [cutoff]
  )

  // Approximate uptime from health checks if available
  const healthRow = safeGet<{ healthy: number; total: number }>(db,
    `SELECT SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy,
            COUNT(id) as total
     FROM health_checks WHERE checked_at >= ?`,
    [cutoff]
  )
  const uptimePercent = healthRow && healthRow.total > 0
    ? (healthRow.healthy / healthRow.total) * 100
    : 100

  return {
    totalAgents: agents?.totalAgents ?? 0,
    activeAgents: agents?.activeAgents ?? 0,
    activeSessions: sessions?.activeSessions ?? 0,
    tasksCompleted: tasks?.completed ?? 0,
    totalTasks: tasks?.total ?? 0,
    uptimePercent,
  }
}

interface ActivityRow { date: string; tasks: number; sessions: number; activities: number }

export function queryActivityTimeline(
  db: Database.Database, period: string
): ActivityRow[] {
  const cutoff = periodCutoff(period)

  // Aggregate daily activity counts from activities table
  return safeAll<ActivityRow>(db,
    `SELECT date(created_at, 'unixepoch') as date,
            SUM(CASE WHEN entity_type = 'task' THEN 1 ELSE 0 END) as tasks,
            SUM(CASE WHEN entity_type = 'session' THEN 1 ELSE 0 END) as sessions,
            COUNT(id) as activities
     FROM activities
     WHERE created_at >= ?
     GROUP BY date(created_at, 'unixepoch')
     ORDER BY date ASC`,
    [cutoff]
  )
}

// -- Agent queries --

interface AgentMetricRow {
  name: string; role: string; status: string
  tasksCompleted: number; totalTasks: number
  avgResponseTimeSec: number; successRate: number
}

export function queryAgentMetrics(
  db: Database.Database, period: string
): AgentMetricRow[] {
  const cutoff = periodCutoff(period)

  return safeAll<AgentMetricRow>(db,
    `SELECT a.name, a.role, a.status,
            COUNT(CASE WHEN t.status = 'done' THEN 1 END) as tasksCompleted,
            COUNT(t.id) as totalTasks,
            COALESCE(AVG(CASE WHEN t.actual_hours IS NOT NULL THEN t.actual_hours * 3600 END), 0) as avgResponseTimeSec,
            CASE WHEN COUNT(t.id) > 0
              THEN CAST(COUNT(CASE WHEN t.outcome = 'success' THEN 1 END) AS REAL) / COUNT(t.id) * 100
              ELSE 0
            END as successRate
     FROM agents a
     LEFT JOIN tasks t ON t.assigned_to = a.name AND t.created_at >= ?
     GROUP BY a.name, a.role, a.status
     ORDER BY tasksCompleted DESC`,
    [cutoff]
  )
}

interface StatusRow { status: string; count: number }

export function queryAgentStatusDistribution(db: Database.Database): StatusRow[] {
  return safeAll<StatusRow>(db,
    `SELECT status, COUNT(id) as count FROM agents GROUP BY status`
  )
}

// -- Task queries --

interface TaskTimelineRow { date: string; created: number; completed: number }

export function queryTaskTimeline(
  db: Database.Database, period: string
): TaskTimelineRow[] {
  const cutoff = periodCutoff(period)

  return safeAll<TaskTimelineRow>(db,
    `SELECT date(created_at, 'unixepoch') as date,
            COUNT(id) as created,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed
     FROM tasks
     WHERE created_at >= ?
     GROUP BY date(created_at, 'unixepoch')
     ORDER BY date ASC`,
    [cutoff]
  )
}

interface BreakdownRow { label: string; count: number }

export function queryTasksByPriority(db: Database.Database, period: string): BreakdownRow[] {
  const cutoff = periodCutoff(period)
  return safeAll<BreakdownRow>(db,
    `SELECT priority as label, COUNT(id) as count
     FROM tasks WHERE created_at >= ?
     GROUP BY priority ORDER BY count DESC`,
    [cutoff]
  )
}

export function queryTasksByStatus(db: Database.Database, period: string): BreakdownRow[] {
  const cutoff = periodCutoff(period)
  return safeAll<BreakdownRow>(db,
    `SELECT status as label, COUNT(id) as count
     FROM tasks WHERE created_at >= ?
     GROUP BY status ORDER BY count DESC`,
    [cutoff]
  )
}

export function queryAvgCompletionHours(db: Database.Database, period: string): number {
  const cutoff = periodCutoff(period)
  const row = safeGet<{ avg: number }>(db,
    `SELECT AVG((completed_at - created_at) / 3600.0) as avg
     FROM tasks
     WHERE status = 'done' AND completed_at IS NOT NULL AND created_at >= ?`,
    [cutoff]
  )
  return row?.avg ?? 0
}

// -- Cost queries --

interface CostTimeRow { date: string; model: string; cost: number }

export function queryCostTimeline(
  db: Database.Database, period: string
): { timeline: Array<Record<string, string | number>>; models: string[] } {
  const cutoff = periodCutoff(period)

  const rows = safeAll<CostTimeRow>(db,
    `SELECT date(timestamp, 'unixepoch') as date,
            model, SUM(cost) as cost
     FROM token_usage
     WHERE timestamp >= ?
     GROUP BY date(timestamp, 'unixepoch'), model
     ORDER BY date ASC`,
    [cutoff]
  )

  // Pivot into per-date records with one key per model
  const modelSet = new Set<string>()
  const dateMap = new Map<string, Record<string, string | number>>()
  for (const row of rows) {
    const shortModel = row.model.split('/').pop() ?? row.model
    modelSet.add(shortModel)
    const existing = dateMap.get(row.date) ?? { date: row.date }
    existing[shortModel] = Number(((existing[shortModel] as number ?? 0) + row.cost).toFixed(6))
    dateMap.set(row.date, existing)
  }

  return {
    timeline: Array.from(dateMap.values()),
    models: Array.from(modelSet),
  }
}

interface DeptCostRow { department: string; cost: number }

export function queryCostByDepartment(db: Database.Database, period: string): DeptCostRow[] {
  const cutoff = periodCutoff(period)

  // Approximate department via agent role prefix
  return safeAll<DeptCostRow>(db,
    `SELECT COALESCE(a.role, 'unassigned') as department,
            SUM(tu.cost) as cost
     FROM token_usage tu
     LEFT JOIN agents a ON tu.session_id IN (
       SELECT s.id FROM sessions s WHERE s.agent = a.name
     )
     WHERE tu.timestamp >= ?
     GROUP BY department
     ORDER BY cost DESC
     LIMIT 12`,
    [cutoff]
  )
}

export function queryTotalCost(db: Database.Database, period: string): number {
  const cutoff = periodCutoff(period)
  const row = safeGet<{ total: number }>(db,
    `SELECT COALESCE(SUM(cost), 0) as total FROM token_usage WHERE timestamp >= ?`,
    [cutoff]
  )
  return row?.total ?? 0
}

// -- Performance queries --

interface PerfRow {
  date: string; p50: number; p95: number; p99: number
  throughput: number; errorRate: number
}

export function queryPerformanceTimeline(
  db: Database.Database, period: string
): PerfRow[] {
  const cutoff = periodCutoff(period)

  // Derive latency from activities duration data if available
  return safeAll<PerfRow>(db,
    `SELECT date(created_at, 'unixepoch') as date,
            COUNT(id) as throughput,
            0 as p50, 0 as p95, 0 as p99,
            SUM(CASE WHEN type LIKE '%error%' THEN 1 ELSE 0 END) * 100.0 /
              MAX(COUNT(id), 1) as errorRate
     FROM activities
     WHERE created_at >= ?
     GROUP BY date(created_at, 'unixepoch')
     ORDER BY date ASC`,
    [cutoff]
  )
}

// -- Usage queries --

interface HeatmapRow { day: number; hour: number; count: number }

export function queryHeatmap(db: Database.Database, period: string): HeatmapRow[] {
  const cutoff = periodCutoff(period)

  return safeAll<HeatmapRow>(db,
    `SELECT CAST(strftime('%w', created_at, 'unixepoch') AS INTEGER) as day,
            CAST(strftime('%H', created_at, 'unixepoch') AS INTEGER) as hour,
            COUNT(id) as count
     FROM activities
     WHERE created_at >= ?
     GROUP BY day, hour`,
    [cutoff]
  )
}

interface TopUserRow { name: string; actions: number }

export function queryTopUsers(db: Database.Database, period: string): TopUserRow[] {
  const cutoff = periodCutoff(period)

  return safeAll<TopUserRow>(db,
    `SELECT actor as name, COUNT(id) as actions
     FROM activities
     WHERE created_at >= ?
     GROUP BY actor
     ORDER BY actions DESC
     LIMIT 10`,
    [cutoff]
  )
}

export function queryUsageSummary(
  db: Database.Database, period: string
): { avgSessionMinutes: number; peakHour: number; peakDay: number } {
  const cutoff = periodCutoff(period)

  const peakHourRow = safeGet<{ hour: number }>(db,
    `SELECT CAST(strftime('%H', created_at, 'unixepoch') AS INTEGER) as hour
     FROM activities WHERE created_at >= ?
     GROUP BY hour ORDER BY COUNT(id) DESC LIMIT 1`,
    [cutoff]
  )

  const peakDayRow = safeGet<{ day: number }>(db,
    `SELECT CAST(strftime('%w', created_at, 'unixepoch') AS INTEGER) as day
     FROM activities WHERE created_at >= ?
     GROUP BY day ORDER BY COUNT(id) DESC LIMIT 1`,
    [cutoff]
  )

  // Approximate session duration from session start/last-activity timestamps
  const avgRow = safeGet<{ avg: number }>(db,
    `SELECT AVG((COALESCE(last_activity, started_at) - started_at) / 60.0) as avg
     FROM sessions WHERE started_at >= ?`,
    [cutoff]
  )

  return {
    avgSessionMinutes: avgRow?.avg ?? 0,
    peakHour: peakHourRow?.hour ?? -1,
    peakDay: peakDayRow?.day ?? -1,
  }
}
