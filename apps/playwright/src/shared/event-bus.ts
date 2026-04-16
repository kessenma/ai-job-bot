/**
 * In-memory pub/sub for streaming search events to SSE clients.
 * Keyed by sessionId (UUID generated per search request).
 */

export interface SearchEvent {
  type: 'log' | 'progress' | 'screenshot' | 'result' | 'done' | 'error'
  message?: string
  stage?: string
  progress?: number
  /** base64-encoded JPEG screenshot */
  screenshot?: string
  label?: string
  /** Streamed search result (for type: 'result') */
  result?: Record<string, unknown>
  timestamp: number
}

type Listener = (event: SearchEvent) => void

const sessions = new Map<string, Set<Listener>>()

export const eventBus = {
  subscribe(sessionId: string, listener: Listener): () => void {
    if (!sessions.has(sessionId)) sessions.set(sessionId, new Set())
    const listeners = sessions.get(sessionId)!
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },

  emit(sessionId: string, event: SearchEvent) {
    const listeners = sessions.get(sessionId)
    if (!listeners) return
    for (const listener of listeners) {
      try { listener(event) } catch { /* subscriber error, ignore */ }
    }
  },

  /** Remove session listeners after a delay (gives late SSE subscribers time to connect) */
  cleanup(sessionId: string, delayMs = 30_000) {
    setTimeout(() => { sessions.delete(sessionId) }, delayMs)
  },
}
