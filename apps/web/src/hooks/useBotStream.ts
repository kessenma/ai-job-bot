import { useState, useEffect, useRef } from 'react'

export interface StreamedResult {
  title: string
  company: string
  url: string
  externalUrl?: string
  location?: string
  workType?: string
  matchedSkills: string[]
  missingSkills: string[]
  description?: string
  matchScore?: { matched: number; total: number }
  sponsorshipMentioned?: boolean
  sponsorshipPolicy?: string
  sponsorshipSnippet?: string
  recruiterEmail?: string
  recruiterPhone?: string
}

export interface BotStreamState {
  connected: boolean
  logs: string[]
  latestScreenshot: string | null
  /** Stage name from progress events */
  stage: string | null
  /** 0-1 normalized progress */
  progress: number
  /** Results streamed in real-time as they're found */
  results: StreamedResult[]
  done: boolean
  error: string | null
}

const INITIAL_STATE: BotStreamState = {
  connected: false,
  logs: [],
  latestScreenshot: null,
  stage: null,
  progress: 0,
  results: [],
  done: false,
  error: null,
}

/** Default SSE stream URL builder (LinkedIn search) */
const DEFAULT_STREAM_URL = (sessionId: string) =>
  `/api/pw-stream/linkedin-search/stream/${sessionId}`

/**
 * React hook that manages an EventSource connection to a Playwright
 * SSE endpoint for real-time bot visibility.
 *
 * @param sessionId  Unique session to subscribe to (null = disconnected)
 * @param streamUrl  Optional custom URL builder. Receives sessionId, returns the SSE endpoint URL.
 */
export function useBotStream(
  sessionId: string | null,
  streamUrl: (sessionId: string) => string = DEFAULT_STREAM_URL,
): BotStreamState {
  const [state, setState] = useState<BotStreamState>(INITIAL_STATE)
  const sourceRef = useRef<EventSource | null>(null)

  // Reset state when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setState(INITIAL_STATE)
      return
    }

    setState({ ...INITIAL_STATE, connected: false })

    const es = new EventSource(streamUrl(sessionId))
    sourceRef.current = es

    es.onopen = () => {
      setState((s) => ({ ...s, connected: true }))
    }

    es.addEventListener('log', (e) => {
      try {
        const data = JSON.parse(e.data)
        setState((s) => ({ ...s, logs: [...s.logs, data.message] }))
      } catch { /* bad data */ }
    })

    es.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data)
        setState((s) => ({ ...s, stage: data.stage, progress: data.progress ?? s.progress }))
      } catch { /* bad data */ }
    })

    es.addEventListener('result', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.result) {
          setState((s) => ({ ...s, results: [...s.results, data.result as StreamedResult] }))
        }
      } catch { /* bad data */ }
    })

    es.addEventListener('screenshot', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.screenshot) {
          setState((s) => ({ ...s, latestScreenshot: data.screenshot }))
        }
      } catch { /* bad data */ }
    })

    es.addEventListener('done', () => {
      setState((s) => ({ ...s, done: true, stage: 'done', progress: 1, connected: false }))
      es.close()
    })

    es.addEventListener('error', (e) => {
      // SSE 'error' event can be a reconnection attempt or a real error
      if (es.readyState === EventSource.CLOSED) {
        setState((s) => ({ ...s, connected: false }))
        return
      }
      // Check if it's a data event (from our eventBus error type)
      const messageEvent = e as MessageEvent
      if (messageEvent.data) {
        try {
          const data = JSON.parse(messageEvent.data)
          setState((s) => ({ ...s, error: data.message || 'Search failed', done: true, connected: false }))
          es.close()
        } catch { /* reconnection attempt, not a data event */ }
      }
    })

    es.onerror = () => {
      // Generic SSE error — could be a reconnection attempt or a real close
      if (es.readyState === EventSource.CLOSED) {
        setState((s) => ({
          ...s,
          connected: false,
          // If we never got a done/error event, mark as done with error so panel stays visible
          done: s.done || true,
          error: s.error || (s.done ? null : 'Connection lost'),
        }))
      }
    }

    return () => {
      es.close()
      sourceRef.current = null
    }
  }, [sessionId])

  return state
}
