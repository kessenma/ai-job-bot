import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ArrowClockwise, CheckCircle, XCircle, CircleNotch } from '@phosphor-icons/react'
import { startCliAuth, pollCliAuth, stopCliAuth } from '#/lib/cli-auth.api.ts'

const CLI_LABELS: Record<string, { name: string; description: string }> = {
  claude: {
    name: 'Claude CLI',
    description: 'This will open your browser to authenticate with Anthropic.',
  },
  codex: {
    name: 'Codex CLI',
    description: 'This will open your browser to authenticate with OpenAI.',
  },
  gh: {
    name: 'GitHub CLI',
    description: 'This will open your browser to authenticate with GitHub.',
  },
}

export function CliAuthModal({
  cli,
  onClose,
  onSuccess,
}: {
  cli: 'claude' | 'codex' | 'gh'
  onClose: () => void
  onSuccess: () => void
}) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const label = CLI_LABELS[cli] || { name: cli, description: '' }

  const startProcess = useCallback(async () => {
    setStarting(true)
    setError(null)
    setLines([])
    setDone(false)
    setExitCode(null)

    try {
      const result = await startCliAuth({ data: { cli } })
      if (result.error) {
        setError(result.error)
        setStarting(false)
        return
      }
      setSessionId(result.sessionId)
      setLines([`$ ${cli} ${cli === 'codex' ? 'login' : 'auth login'}${cli === 'gh' ? ' --web' : ''}`, ''])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start auth process')
    } finally {
      setStarting(false)
    }
  }, [cli])

  // Start the process on mount
  useEffect(() => {
    startProcess()
    return () => {
      // Kill process on unmount
      if (sessionId) {
        stopCliAuth({ data: { sessionId } }).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll for output
  useEffect(() => {
    if (!sessionId || done) return

    pollRef.current = setInterval(async () => {
      try {
        const result = await pollCliAuth({ data: { sessionId } })
        setLines(result.output)
        if (result.done) {
          setDone(true)
          setExitCode(result.exitCode)
          if (pollRef.current) clearInterval(pollRef.current)

          // Auto-trigger success callback after 1.5s on exit code 0
          if (result.exitCode === 0) {
            setTimeout(() => onSuccess(), 1500)
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 500)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [sessionId, done, onSuccess])

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [lines])

  const handleRetry = () => {
    if (sessionId) {
      stopCliAuth({ data: { sessionId } }).catch(() => {})
    }
    setSessionId(null)
    startProcess()
  }

  const handleClose = () => {
    if (sessionId) {
      stopCliAuth({ data: { sessionId } }).catch(() => {})
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[420px] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[#1a1a1a] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">{label.name} Login</h3>
            <p className="text-xs text-white/50">{label.description}</p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-md p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Terminal */}
        <div
          ref={terminalRef}
          className="flex-1 overflow-y-auto px-4 py-3 font-mono text-sm leading-relaxed"
        >
          {lines.length === 0 && !error && (
            <div className="flex items-center gap-2 text-white/40">
              <CircleNotch className="h-3.5 w-3.5 animate-spin" />
              <span>Starting {label.name}...</span>
            </div>
          )}
          {lines.map((line, i) => (
            <div key={i} className={getLineStyle(line)}>
              {line}
            </div>
          ))}
          {error && (
            <div className="text-red-400">{error}</div>
          )}
          {!done && sessionId && (
            <div className="mt-1 inline-block h-4 w-2 animate-pulse bg-green-400/80" />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            {done && exitCode === 0 && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                <CheckCircle className="h-3.5 w-3.5" weight="fill" />
                Authenticated successfully
              </span>
            )}
            {done && exitCode !== null && exitCode !== 0 && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                Authentication failed (exit code {exitCode})
              </span>
            )}
            {!done && sessionId && (
              <span className="flex items-center gap-1.5 text-xs text-white/40">
                <CircleNotch className="h-3.5 w-3.5 animate-spin" />
                Waiting for authentication...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(done || error) && (
              <button
                onClick={handleRetry}
                disabled={starting}
                className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                <ArrowClockwise className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
            <button
              onClick={handleClose}
              className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getLineStyle(line: string): string {
  if (line.startsWith('$')) return 'text-green-400'
  if (line.startsWith('✓') || /success|authenticated|logged\s+in/i.test(line)) return 'text-green-400'
  if (line.startsWith('✗') || /error|fail/i.test(line)) return 'text-red-400'
  if (/http[s]?:\/\//i.test(line)) return 'text-blue-400 underline'
  if (/waiting|opening|press/i.test(line)) return 'text-yellow-300/80'
  return 'text-white/80'
}
