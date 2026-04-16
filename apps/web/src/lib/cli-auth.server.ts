import type { Subprocess } from 'bun'
import { getConfigValue } from './config.server.ts'

/**
 * In-memory store of running auth processes.
 * Keyed by session ID. Cleared on server restart (fine for a dev tool).
 */
interface AuthSession {
  proc: Subprocess
  output: string[]
  done: boolean
  exitCode: number | null
  cli: string
  startedAt: number
}

const sessions = new Map<string, AuthSession>()

// Clean up stale sessions older than 5 minutes
function cleanupStaleSessions() {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.startedAt > 5 * 60 * 1000) {
      if (!session.done) {
        try { session.proc.kill() } catch { /* ignore */ }
      }
      sessions.delete(id)
    }
  }
}

function getAuthCommand(cli: string, cliPath: string): string[] {
  switch (cli) {
    case 'claude':
      return [cliPath, 'auth', 'login']
    case 'codex':
      return [cliPath, 'login']
    case 'gh':
      // Use --web to skip interactive prompts — goes straight to browser auth
      return [cliPath, 'auth', 'login', '--web']
    default:
      throw new Error(`Unknown CLI: ${cli}`)
  }
}

function getConfigKey(cli: string): string {
  switch (cli) {
    case 'claude': return 'claude_cli_path'
    case 'codex': return 'codex_cli_path'
    case 'gh': return 'gh_cli_path'
    default: throw new Error(`Unknown CLI: ${cli}`)
  }
}

export async function startAuthProcess(cli: string): Promise<{ sessionId: string; error?: string }> {
  cleanupStaleSessions()

  const cliPath = await getConfigValue(getConfigKey(cli))
  if (!cliPath) {
    return { sessionId: '', error: `${cli} CLI not detected. Run detection first.` }
  }

  const sessionId = crypto.randomUUID()
  const args = getAuthCommand(cli, cliPath)

  // Use `script -q /dev/null` on macOS to allocate a pseudo-TTY
  // so the CLI thinks it's running in a real terminal
  const proc = Bun.spawn(['script', '-q', '/dev/null', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      // Force color output for CLIs that support it
      FORCE_COLOR: '1',
      TERM: 'xterm-256color',
    },
  })

  const session: AuthSession = {
    proc,
    output: [],
    done: false,
    exitCode: null,
    cli,
    startedAt: Date.now(),
  }

  sessions.set(sessionId, session)

  // Stream stdout
  if (proc.stdout) {
    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    ;(async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value, { stream: true })
          // Split by newlines but keep the lines
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.trim()) {
              // Strip ANSI escape codes for clean display
              const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '')
              if (clean.trim()) session.output.push(clean)
            }
          }
        }
      } catch { /* stream ended */ }
    })()
  }

  // Stream stderr
  if (proc.stderr) {
    const reader = proc.stderr.getReader()
    const decoder = new TextDecoder()
    ;(async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value, { stream: true })
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.trim()) {
              const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '')
              if (clean.trim()) session.output.push(clean)
            }
          }
        }
      } catch { /* stream ended */ }
    })()
  }

  // Monitor exit
  proc.exited.then((code) => {
    session.done = true
    session.exitCode = code
    if (code === 0) {
      session.output.push('✓ Authentication completed successfully.')
    } else {
      session.output.push(`✗ Process exited with code ${code}.`)
    }
  })

  return { sessionId }
}

export function pollAuthProcess(sessionId: string): {
  output: string[]
  done: boolean
  exitCode: number | null
  error?: string
} {
  const session = sessions.get(sessionId)
  if (!session) {
    return { output: [], done: true, exitCode: 1, error: 'Session not found' }
  }

  return {
    output: [...session.output],
    done: session.done,
    exitCode: session.exitCode,
  }
}

export function killAuthProcess(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session && !session.done) {
    try { session.proc.kill() } catch { /* ignore */ }
    session.done = true
    session.exitCode = -1
  }
  sessions.delete(sessionId)
}
