// Formatting helpers for calendar display values

export function formatTime(iso: string): string {
  if (!iso) return ''
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const date = new Date(iso)
    return date.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  } catch {
    return 'Unknown'
  }
}

export const SOURCE_BADGES: Record<
  string,
  { readonly label: string; readonly className: string }
> = {
  google: { label: 'Google', className: 'bg-blue-500/20 text-blue-400' },
  apple: { label: 'Apple', className: 'bg-purple-500/20 text-purple-400' },
  manual: { label: 'Manual', className: 'bg-teal-500/20 text-teal-400' },
  cron: { label: 'Cron', className: 'bg-amber-500/20 text-amber-400' },
  task: { label: 'Task', className: 'bg-emerald-500/20 text-emerald-400' },
  completed: { label: 'Done', className: 'bg-green-500/20 text-green-400' },
}

export const PROVIDER_COLORS: Record<string, string> = {
  google: 'border-blue-500',
  apple: 'border-purple-500',
  ical: 'border-purple-500',
}
