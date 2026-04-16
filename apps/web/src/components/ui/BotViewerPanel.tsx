import { useState, useEffect, useRef, type ReactNode } from 'react'
import { CaretDown, CaretUp, Eye, Play, Pause, Warning } from '@phosphor-icons/react'
import type { BotStreamState } from '#/hooks/useBotStream.ts'

// ─── Shared log coloring (extracted from LinkedInScanner) ────────────────────

export function logLineColor(line: string): string {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('failed')) return 'text-red-400'
  if (line.includes('skipped')) return 'text-yellow-400/70'
  if (line.includes('skill matches') || line.includes('[match ')) return 'text-green-400'
  if (lower.includes('successful') || lower.includes('complete') || lower.includes('Login still valid')) return 'text-[var(--lagoon)]'
  return ''
}

// ─── Stage label mapping ────────────────────────────────────────────────────

const DEFAULT_STAGE_LABELS: Record<string, string> = {
  logging_in: 'Logging in to LinkedIn...',
  logged_in: 'Logged in',
  navigating: 'Navigating to search...',
  search_loaded: 'Search results loaded',
  scrolling: 'Loading more results...',
  scanning_cards: 'Scanning job cards...',
  done: 'Complete',
}

function stageLabel(stage: string | null, customLabels?: Record<string, string>): string {
  if (!stage) return 'Connecting...'
  const labels = customLabels ? { ...DEFAULT_STAGE_LABELS, ...customLabels } : DEFAULT_STAGE_LABELS
  return labels[stage] || stage
}

// ─── Live mode panel ─────────────────────────────────────────────────────────

interface LivePanelProps {
  stream: BotStreamState
  stageLabels?: Record<string, string>
}

function LivePanel({ stream, stageLabels }: LivePanelProps) {
  const logsContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll only the log container (not the whole page)
  useEffect(() => {
    const el = logsContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [stream.logs.length])

  return (
    <div className="mt-3 space-y-3">
      {/* Screenshot area */}
      <div className="relative overflow-hidden rounded-lg border border-[var(--line)] bg-[#0a0a0a]" style={{ aspectRatio: '1280 / 900' }}>
        {stream.latestScreenshot ? (
          <img
            src={`data:image/jpeg;base64,${stream.latestScreenshot}`}
            alt="Bot view"
            className="h-full w-full object-contain transition-opacity duration-300"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            Waiting for first frame...
          </div>
        )}

        {/* LIVE badge */}
        {stream.connected && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            LIVE
          </div>
        )}

        {/* Stage overlay */}
        {stream.stage && stream.stage !== 'done' && (
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
            {stageLabel(stream.stage, stageLabels)}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {stream.progress > 0 && stream.progress < 1 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-strong)]">
          <div
            className="h-full rounded-full bg-[var(--lagoon)] transition-all duration-500 ease-out"
            style={{ width: `${Math.max(stream.progress * 100, 5)}%` }}
          />
        </div>
      )}

      {/* Log terminal */}
      <div ref={logsContainerRef} className="max-h-48 overflow-auto rounded-lg border border-[var(--line)] bg-[#0a0a0a] p-3 font-mono text-[11px] leading-relaxed text-neutral-300">
        {stream.logs.length === 0 ? (
          <div className="text-neutral-500">Waiting for logs...</div>
        ) : (
          stream.logs.map((line, i) => (
            <div key={i} className={logLineColor(line)}>{line}</div>
          ))
        )}
      </div>

      {/* Error */}
      {stream.error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <Warning className="h-3.5 w-3.5 shrink-0" />
          {stream.error}
        </div>
      )}
    </div>
  )
}

// ─── Replay mode panel ───────────────────────────────────────────────────────

interface ReplayPanelProps {
  searchId: string
  recordingBaseUrl?: string
}

interface RecordingMeta {
  frames: { file: string; timestamp: number }[]
  logs: string[]
  savedAt: number
}

const DEFAULT_RECORDING_BASE_URL = '/api/pw-stream/recordings'

function ReplayPanel({ searchId, recordingBaseUrl = DEFAULT_RECORDING_BASE_URL }: ReplayPanelProps) {
  const [meta, setMeta] = useState<RecordingMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`${recordingBaseUrl}/${searchId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Recording not found')
        return res.json()
      })
      .then((data) => { setMeta(data); setCurrentFrame(0); setPlaying(false) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [searchId])

  // Auto-play
  useEffect(() => {
    if (!playing || !meta) return
    intervalRef.current = setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev >= meta.frames.length - 1) {
          setPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, 300) // Faster playback for replay
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, meta])

  if (loading) {
    return <div className="mt-3 text-center text-sm text-[var(--sea-ink-soft)]">Loading recording...</div>
  }

  if (error) {
    return (
      <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-center text-sm text-[var(--sea-ink-soft)]">
        Recording expired or unavailable
      </div>
    )
  }

  if (!meta || meta.frames.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-center text-sm text-[var(--sea-ink-soft)]">
        No frames recorded for this search
      </div>
    )
  }

  const frame = meta.frames[currentFrame]

  return (
    <div className="mt-3 space-y-3">
      {/* Screenshot */}
      <div className="relative overflow-hidden rounded-lg border border-[var(--line)] bg-[#0a0a0a]" style={{ aspectRatio: '1280 / 900' }}>
        <img
          src={`${recordingBaseUrl}/${searchId}/${frame.file}`}
          alt={`Frame ${currentFrame + 1}`}
          className="h-full w-full object-contain"
        />
        <div className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
          REPLAY
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying(!playing)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={meta.frames.length - 1}
          value={currentFrame}
          onChange={(e) => { setCurrentFrame(Number(e.target.value)); setPlaying(false) }}
          className="flex-1"
        />
        <span className="text-xs text-[var(--sea-ink-soft)]">
          {currentFrame + 1}/{meta.frames.length}
        </span>
      </div>

      {/* Logs */}
      {meta.logs.length > 0 && (
        <div className="max-h-48 overflow-auto rounded-lg border border-[var(--line)] bg-[#0a0a0a] p-3 font-mono text-[11px] leading-relaxed text-neutral-300">
          {meta.logs.map((line, i) => (
            <div key={i} className={logLineColor(line)}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main exported component ─────────────────────────────────────────────────

interface BotViewerPanelProps {
  /** Live stream state (for active searches) */
  stream?: BotStreamState
  /** For replay mode — past search ID */
  replaySearchId?: string | null
  /** Whether a search is currently active */
  isSearching?: boolean
  /** Custom stage label overrides (merged with defaults) */
  stageLabels?: Record<string, string>
  /** Base URL for fetching recordings (default: /api/pw-stream/recordings) */
  recordingBaseUrl?: string
  /** Panel title (default: "Bot Viewer") */
  title?: string
  /** Content rendered below the live/replay panel when open */
  children?: ReactNode
}

export function BotViewerPanel({ stream, replaySearchId, isSearching, stageLabels, recordingBaseUrl, title = 'Bot Viewer', children }: BotViewerPanelProps) {
  const [open, setOpen] = useState(false)

  // Auto-open when search starts streaming, on error, or when children appear (e.g. dry run result)
  useEffect(() => {
    if (stream?.connected) setOpen(true)
  }, [stream?.connected])

  useEffect(() => {
    if (stream?.error) setOpen(true)
  }, [stream?.error])

  useEffect(() => {
    if (children) setOpen(true)
  }, [children])

  const isLive = isSearching && stream
  const isReplay = !isSearching && replaySearchId

  // Keep panel visible if: live streaming, replay, has children, or stream has any data to show
  const streamHasData = stream && (stream.done || stream.error || stream.logs.length > 0 || stream.latestScreenshot)
  const hasContent = isLive || isReplay || (children !== null && children !== undefined && children !== false) || streamHasData
  if (!hasContent) return null

  const statusText = isLive
    ? stream.connected
      ? stageLabel(stream.stage, stageLabels)
      : stream.done
        ? 'Complete'
        : 'Connecting...'
    : isReplay
      ? 'Replay'
      : stream?.error
        ? 'Error'
        : stream?.done
          ? 'Complete — review below'
          : streamHasData
            ? 'Disconnected'
            : ''

  return (
    <div className="mb-6 island-shell rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-[var(--lagoon)]" />
          <span className="text-sm font-semibold text-[var(--sea-ink)]">{title}</span>
          {isLive && stream.connected && (
            <span className="flex items-center gap-1 rounded-full bg-red-600/10 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
              Live
            </span>
          )}
          <span className="text-xs text-[var(--sea-ink-soft)]">— {statusText}</span>
        </div>
        {open ? <CaretUp className="h-4 w-4 text-[var(--sea-ink-soft)]" /> : <CaretDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />}
      </button>

      {open && (
        <div className="px-4 pb-4">
          {(isLive || streamHasData) && stream && <LivePanel stream={stream} stageLabels={stageLabels} />}
          {isReplay && replaySearchId && <ReplayPanel searchId={replaySearchId} recordingBaseUrl={recordingBaseUrl} />}
          {children}
        </div>
      )}
    </div>
  )
}
