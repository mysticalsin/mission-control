// ---------------------------------------------------------------------------
// Shared TypeScript types for the Marketing Studio panel
// ---------------------------------------------------------------------------

export interface MarketingLead {
  readonly id: number
  readonly name: string
  readonly company: string
  readonly email: string
  readonly status: 'new' | 'contacted' | 'qualified' | 'converted'
  readonly source: string
  readonly score: number
  readonly notes: string
  readonly created_at: number
  readonly updated_at: number
}

export interface MarketingSignal {
  readonly id: number
  readonly signal_type: string
  readonly company: string
  readonly description: string
  readonly confidence: number
  readonly source_url: string
  readonly created_at: number
}

export interface MarketingCampaign {
  readonly id: number
  readonly name: string
  readonly type: 'email' | 'social' | 'content' | 'event'
  readonly status: 'draft' | 'active' | 'paused' | 'completed'
  readonly budget: number
  readonly spent: number
  readonly leads_generated: number
  readonly conversion_rate: number
  readonly start_date: string | null
  readonly end_date: string | null
  readonly created_at: number
  readonly updated_at: number
}

export interface MarketingPresentation {
  readonly id: number
  readonly title: string
  readonly topic: string
  readonly slide_count: number
  readonly status: 'generating' | 'ready' | 'archived'
  readonly created_at: number
}

export interface FunnelData {
  readonly new: number
  readonly contacted: number
  readonly qualified: number
  readonly converted: number
}

export type MarketingTab = 'leads' | 'signals' | 'campaigns' | 'presentations'

// Status badge color mappings
export const LEAD_STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  contacted: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  qualified: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  converted: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
}

export const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-secondary text-muted-foreground border-border',
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  completed: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
}

export const CAMPAIGN_TYPE_COLORS: Record<string, string> = {
  email: 'bg-cyan-500/10 text-cyan-400',
  social: 'bg-pink-500/10 text-pink-400',
  content: 'bg-violet-500/10 text-violet-400',
  event: 'bg-orange-500/10 text-orange-400',
}

export const SIGNAL_TYPE_ICONS: Record<string, string> = {
  funding: 'bg-emerald-500/10 text-emerald-400',
  job_posting: 'bg-blue-500/10 text-blue-400',
  news: 'bg-amber-500/10 text-amber-400',
  social: 'bg-pink-500/10 text-pink-400',
}

export function formatUnixDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString()
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
