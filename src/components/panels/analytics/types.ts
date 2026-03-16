// Shared types for the Analytics Dashboard panel

export type AnalyticsTab = 'overview' | 'agents' | 'tasks' | 'costs' | 'performance' | 'usage'
export type AnalyticsPeriod = '24h' | '7d' | '30d' | '90d'

// -- Overview --

export interface OverviewMetrics {
  totalAgents: number
  activeAgents: number
  activeSessions: number
  tasksCompleted: number
  totalTasks: number
  uptimePercent: number
}

export interface ActivityPoint {
  date: string
  tasks: number
  sessions: number
  activities: number
}

export interface OverviewData {
  metrics: OverviewMetrics
  activityTimeline: ActivityPoint[]
}

// -- Agents --

export interface AgentMetric {
  name: string
  role: string
  tasksCompleted: number
  totalTasks: number
  avgResponseTimeSec: number
  successRate: number
  status: string
}

export interface AgentStatusCount {
  status: string
  count: number
}

export interface AgentsData {
  topAgents: AgentMetric[]
  statusDistribution: AgentStatusCount[]
}

// -- Tasks --

export interface TaskTimelinePoint {
  date: string
  created: number
  completed: number
}

export interface TaskBreakdown {
  label: string
  count: number
}

export interface TasksData {
  timeline: TaskTimelinePoint[]
  byPriority: TaskBreakdown[]
  byStatus: TaskBreakdown[]
  avgCompletionHours: number
}

// -- Costs --

export interface CostTimelinePoint {
  date: string
  [model: string]: string | number
}

export interface CostDepartment {
  department: string
  cost: number
}

export interface CostsData {
  timeline: CostTimelinePoint[]
  models: string[]
  byDepartment: CostDepartment[]
  totalCost: number
  budgetUsedPercent: number
}

// -- Performance --

export interface PerfPoint {
  date: string
  p50: number
  p95: number
  p99: number
  throughput: number
  errorRate: number
}

export interface PerformanceData {
  timeline: PerfPoint[]
  avgLatencyMs: number
  avgThroughput: number
  avgErrorRate: number
}

// -- Usage --

export interface HeatmapCell {
  day: number
  hour: number
  count: number
}

export interface TopUser {
  name: string
  actions: number
}

export interface UsageData {
  heatmap: HeatmapCell[]
  topUsers: TopUser[]
  avgSessionMinutes: number
  peakHour: number
  peakDay: number
}

// -- API response envelope --

export interface AnalyticsResponse<T> {
  data: T
  period: AnalyticsPeriod
  generatedAt: string
}
