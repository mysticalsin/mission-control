// ---------------------------------------------------------------------------
// Omega panel shared types — all readonly for immutability
// ---------------------------------------------------------------------------

export type OmegaTab = 'dashboard' | 'reports' | 'sources' | 'config'

export interface DecisionStats {
  readonly total_decisions: number
  readonly success_rate: number
  readonly avg_duration_ms: number
  readonly total_tokens_used: number
  readonly by_agent: Readonly<Record<string, number>>
  readonly by_type: Readonly<Record<string, number>>
  readonly by_status: Readonly<Record<string, number>>
}

export interface OmegaStatus {
  readonly status: string
  readonly tables: Readonly<Record<string, number>>
  readonly permission_coverage: number
  readonly chain_samples: readonly ChainSample[]
  readonly cache_size_bytes: number
}

export interface ChainSample {
  readonly agent_id: string
  readonly total_decisions: number
  readonly genesis_correct: boolean
}

export interface ReplayStats {
  readonly total_entries: number
  readonly unique_system_prompts: number
  readonly unique_contexts: number
  readonly cache_hits: number
  readonly cache_hit_rate: number
  readonly total_tokens_used: number
  readonly avg_latency_ms: number
  readonly storage_estimate_mb: number
  readonly top_agents: Readonly<Record<string, number>>
  readonly top_models: Readonly<Record<string, number>>
}

export interface PolicyItem {
  readonly policy_id: string
  readonly policy_name: string
  readonly description: string
  readonly permissions: readonly string[]
}

export interface TimelineEntry {
  readonly id: string
  readonly agent_id: string
  readonly decision_type: string
  readonly action: string
  readonly status: string
  readonly confidence: number
  readonly created_at: string
}

export interface TabProps {
  readonly isLoading: boolean
  readonly setIsLoading: (v: boolean) => void
  readonly error: string | null
  readonly setError: (v: string | null) => void
}
