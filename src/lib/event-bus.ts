import { EventEmitter } from 'events'

/**
 * Server-side event bus for broadcasting database mutations to SSE clients.
 * Singleton per Next.js server process.
 */

/** Maximum concurrent SSE connections to prevent resource exhaustion */
export const MAX_SSE_CONNECTIONS = 100

export interface ServerEvent {
  type: string
  data: any
  timestamp: number
}

// Event types emitted by the bus
export type EventType =
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'chat.message'
  | 'chat.message.deleted'
  | 'notification.created'
  | 'notification.read'
  | 'activity.created'
  | 'agent.updated'
  | 'agent.created'
  | 'agent.deleted'
  | 'agent.synced'
  | 'agent.status_changed'
  | 'audit.security'
  | 'security.event'
  | 'connection.created'
  | 'connection.disconnected'
  | 'github.synced'
  | 'health.check_completed'
  | 'health.circuit_tripped'
  | 'health.circuit_recovered'
  | 'health.recovery_attempted'
  | 'health.service_degraded'
  | 'health.service_restored'
  | 'learning.pattern_stored'
  | 'learning.pattern_applied'
  | 'learning.feedback_received'
  | 'improving.regression_detected'
  | 'improving.suggestion_created'
  | 'improving.cost_spike'

class ServerEventBus extends EventEmitter {
  private static instance: ServerEventBus | null = null
  private _connectionCount = 0

  private constructor() {
    super()
    this.setMaxListeners(MAX_SSE_CONNECTIONS + 10)
  }

  static getInstance(): ServerEventBus {
    if (!ServerEventBus.instance) {
      ServerEventBus.instance = new ServerEventBus()
    }
    return ServerEventBus.instance
  }

  /** Current number of active SSE connections */
  get connectionCount(): number {
    return this._connectionCount
  }

  /** Register a new SSE connection. Returns false if at capacity. */
  addConnection(): boolean {
    if (this._connectionCount >= MAX_SSE_CONNECTIONS) return false
    this._connectionCount += 1
    return true
  }

  /** Unregister an SSE connection on disconnect. */
  removeConnection(): void {
    this._connectionCount = Math.max(0, this._connectionCount - 1)
  }

  /**
   * Broadcast an event to all SSE listeners
   */
  broadcast(type: EventType, data: any): ServerEvent {
    const event: ServerEvent = { type, data, timestamp: Date.now() }
    this.emit('server-event', event)
    return event
  }
}

// Use globalThis to survive HMR in development
const globalBus = globalThis as typeof globalThis & { __eventBus?: ServerEventBus }
export const eventBus = globalBus.__eventBus ?? ServerEventBus.getInstance()
globalBus.__eventBus = eventBus as ServerEventBus
