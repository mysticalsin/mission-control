// Shared constants for Analytics Dashboard sub-views

export const CHART_COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042',
  '#8884d8', '#82ca9d', '#ffc658', '#ff6b6b',
] as const

export const STATUS_COLORS: Record<string, string> = {
  idle: '#00C49F',
  busy: '#FFBB28',
  offline: '#6b7280',
  error: '#ff6b6b',
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toFixed(0)
}

export function formatCost(cost: number): string {
  return '$' + cost.toFixed(4)
}

export function formatMs(ms: number): string {
  if (ms >= 1_000) return (ms / 1_000).toFixed(1) + 's'
  return ms.toFixed(0) + 'ms'
}

export function formatPercent(value: number): string {
  return value.toFixed(1) + '%'
}
