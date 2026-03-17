/**
 * Lightweight circuit breaker for protecting upstream service calls.
 *
 * States: CLOSED (normal) → OPEN (reject fast) → HALF_OPEN (probe recovery).
 * Uses immutable state — each transition returns a new CircuitState object.
 */

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface CircuitState {
  readonly phase: Phase
  readonly failures: number
  readonly lastFailureAt: number
  readonly halfOpenAttempts: number
}

interface CircuitConfig {
  readonly failureThreshold: number
  readonly resetTimeoutMs: number
  readonly halfOpenMaxAttempts: number
}

// ── Error ────────────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(circuitName: string) {
    super(`Circuit "${circuitName}" is OPEN — requests are being rejected`)
    this.name = 'CircuitOpenError'
  }
}

// ── Default config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 2,
} as const

// ── Internal state store (keyed by circuit name) ─────────────────────────────

const circuits = new Map<string, CircuitState>()
const configs = new Map<string, CircuitConfig>()

function initialState(): CircuitState {
  return { phase: 'CLOSED', failures: 0, lastFailureAt: 0, halfOpenAttempts: 0 }
}

function getState(name: string): CircuitState {
  return circuits.get(name) ?? initialState()
}

function getConfig(name: string): CircuitConfig {
  return configs.get(name) ?? DEFAULT_CONFIG
}

// ── State transitions (immutable) ────────────────────────────────────────────

function recordSuccess(state: CircuitState): CircuitState {
  return { phase: 'CLOSED', failures: 0, lastFailureAt: 0, halfOpenAttempts: 0 }
}

function recordFailure(state: CircuitState, config: CircuitConfig): CircuitState {
  const failures = state.failures + 1
  if (failures >= config.failureThreshold) {
    return { phase: 'OPEN', failures, lastFailureAt: Date.now(), halfOpenAttempts: 0 }
  }
  return { ...state, failures, lastFailureAt: Date.now() }
}

function recordHalfOpenFailure(state: CircuitState): CircuitState {
  return { phase: 'OPEN', failures: state.failures, lastFailureAt: Date.now(), halfOpenAttempts: 0 }
}

function resolvePhase(state: CircuitState, config: CircuitConfig): Phase {
  if (state.phase !== 'OPEN') return state.phase
  const elapsed = Date.now() - state.lastFailureAt
  return elapsed >= config.resetTimeoutMs ? 'HALF_OPEN' : 'OPEN'
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Configure a named circuit (call once at startup if non-default values needed). */
export function configureCircuit(name: string, config: Partial<CircuitConfig>): void {
  configs.set(name, { ...DEFAULT_CONFIG, ...config })
}

/** Execute `fn` with circuit breaker protection. */
export async function executeWithCircuit<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const config = getConfig(name)
  const state = getState(name)
  const phase = resolvePhase(state, config)

  if (phase === 'OPEN') {
    throw new CircuitOpenError(name)
  }

  if (phase === 'HALF_OPEN' && state.halfOpenAttempts >= config.halfOpenMaxAttempts) {
    throw new CircuitOpenError(name)
  }

  // Track half-open probe attempt before executing
  if (phase === 'HALF_OPEN') {
    circuits.set(name, { ...state, phase: 'HALF_OPEN', halfOpenAttempts: state.halfOpenAttempts + 1 })
  }

  try {
    const result = await fn()
    circuits.set(name, recordSuccess(state))
    return result
  } catch (err) {
    const current = getState(name)
    const nextState = phase === 'HALF_OPEN'
      ? recordHalfOpenFailure(current)
      : recordFailure(current, config)
    circuits.set(name, nextState)
    throw err
  }
}

/** Reset a circuit to CLOSED (useful for testing or manual intervention). */
export function resetCircuit(name: string): void {
  circuits.set(name, initialState())
}
