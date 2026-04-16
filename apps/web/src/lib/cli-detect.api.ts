import { createServerFn } from '@tanstack/react-start'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { setConfigValue, getConfigValue } from './config.server.ts'

// ─── Shared helpers ──────────────────────────────────────────────

/**
 * Run a command with the user's full login shell environment.
 * Bun.spawn doesn't inherit ~/.zshrc PATH additions, so we use `zsh -l -c`.
 */
async function runCommand(cmd: string, args: string[], timeoutMs = 10000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const shellCmd = [cmd, ...args].map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')
    const proc = Bun.spawn(['zsh', '-l', '-c', shellCmd], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: homedir() },
    })
    const timeout = setTimeout(() => proc.kill(), timeoutMs)
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    clearTimeout(timeout)
    const exitCode = await proc.exited
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode }
  } catch {
    return { stdout: '', stderr: '', exitCode: 1 }
  }
}

/** Run a command directly (no shell wrapping) for when we have an absolute path. */
async function runDirect(cmd: string, args: string[], timeoutMs = 10000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const proc = Bun.spawn([cmd, ...args], { stdout: 'pipe', stderr: 'pipe' })
    const timeout = setTimeout(() => proc.kill(), timeoutMs)
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    clearTimeout(timeout)
    const exitCode = await proc.exited
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode }
  } catch {
    return { stdout: '', stderr: '', exitCode: 1 }
  }
}

function findNewestGlob(baseDir: string, pattern: RegExp, suffix: string): string | null {
  try {
    if (!existsSync(baseDir)) return null
    const dirs = readdirSync(baseDir)
      .filter((d) => pattern.test(d))
      .sort()
      .reverse()
    for (const dir of dirs) {
      const full = join(baseDir, dir, suffix)
      if (existsSync(full)) return full
    }
  } catch { /* ignore */ }
  return null
}

/** Find a binary by name: login-shell `which` first, then well-known paths. */
async function findBinary(name: string, extraPaths: string[] = []): Promise<string | null> {
  const home = homedir()

  // 1. Login shell `which` (inherits user's full PATH)
  const whichResult = await runCommand('which', [name])
  if (whichResult.exitCode === 0 && whichResult.stdout) {
    const found = whichResult.stdout.split('\n')[0]
    if (found && existsSync(found)) return found
  }

  // 2. Direct filesystem checks
  const defaults = [
    join(home, '.local', 'bin', name),
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
  ]
  for (const p of [...defaults, ...extraPaths]) {
    if (existsSync(p)) return p
  }

  // 3. nvm-managed Node bins
  const nvmDir = join(home, '.nvm', 'versions', 'node')
  const nvmMatch = findNewestGlob(nvmDir, /^v\d+/, join('bin', name))
  if (nvmMatch) return nvmMatch

  return null
}

async function getVersion(binaryPath: string): Promise<string | null> {
  const result = await runDirect(binaryPath, ['--version'])
  if (result.exitCode === 0 && result.stdout) return result.stdout.split('\n')[0]
  return null
}

// ─── Types ───────────────────────────────────────────────────────

export type CliDetectionResult = { found: boolean; path: string | null; version: string | null }
export type CliAuthResult = { authenticated: boolean; user: string | null; error: string | null }
export type CliStatusResult = {
  path: string | null
  available: boolean
  authenticated: boolean
  user: string | null
}

// ─── Claude CLI ──────────────────────────────────────────────────

async function findClaudeBinary(): Promise<string | null> {
  const home = homedir()

  // Try generic lookup first
  const found = await findBinary('claude')
  if (found) return found

  // VS Code extension bundled binary
  const vscodeMatch = findNewestGlob(
    join(home, '.vscode', 'extensions'),
    /^anthropic\.claude-code-/,
    join('resources', 'native-binary', 'claude'),
  )
  if (vscodeMatch) return vscodeMatch

  const insidersMatch = findNewestGlob(
    join(home, '.vscode-insiders', 'extensions'),
    /^anthropic\.claude-code-/,
    join('resources', 'native-binary', 'claude'),
  )
  if (insidersMatch) return insidersMatch

  return null
}

export const detectClaudeCli = createServerFn({ method: 'POST' }).handler(async () => {
  const path = await findClaudeBinary()
  const found = path !== null
  const version = found && path ? await getVersion(path) : null

  await setConfigValue('claude_cli_path', path || '')
  await setConfigValue('claude_cli_available', found ? 'true' : 'false')

  return { found, path, version }
})

export const checkClaudeAuth = createServerFn({ method: 'POST' }).handler(async () => {
  const cliPath = await getConfigValue('claude_cli_path')
  if (!cliPath) return { authenticated: false, user: null, error: 'Claude CLI not detected' }

  // `claude auth status` outputs JSON: {"loggedIn": true, "email": "...", ...}
  const result = await runDirect(cliPath, ['auth', 'status'], 10000)

  let authenticated = false
  let user: string | null = null
  let error: string | null = null

  if (result.exitCode === 0) {
    try {
      const parsed = JSON.parse(result.stdout)
      authenticated = parsed.loggedIn === true
      user = parsed.email || null
    } catch {
      const output = result.stdout + result.stderr
      authenticated = /loggedIn.*true|logged.in/i.test(output)
      const emailMatch = output.match(/[\w.-]+@[\w.-]+\.\w+/)
      if (emailMatch) user = emailMatch[0]
    }
  } else {
    error = result.stderr || result.stdout || 'Auth check failed'
  }

  await setConfigValue('claude_cli_authenticated', authenticated ? 'true' : 'false')
  if (user) await setConfigValue('claude_cli_user', user)

  return { authenticated, user, error }
})

export const getClaudeCliStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const path = await getConfigValue('claude_cli_path')
  const available = (await getConfigValue('claude_cli_available')) === 'true'
  const authenticated = (await getConfigValue('claude_cli_authenticated')) === 'true'
  const user = await getConfigValue('claude_cli_user')
  return { path, available, authenticated, user }
})

// ─── Codex CLI ───────────────────────────────────────────────────

export const detectCodexCli = createServerFn({ method: 'POST' }).handler(async () => {
  const path = await findBinary('codex')
  const found = path !== null
  const version = found && path ? await getVersion(path) : null

  await setConfigValue('codex_cli_path', path || '')
  await setConfigValue('codex_cli_available', found ? 'true' : 'false')

  return { found, path, version }
})

export const checkCodexAuth = createServerFn({ method: 'POST' }).handler(async () => {
  const cliPath = await getConfigValue('codex_cli_path')
  if (!cliPath) return { authenticated: false, user: null, error: 'Codex CLI not detected' }

  // `codex login status` outputs text like "Logged in using ChatGPT"
  const result = await runDirect(cliPath, ['login', 'status'], 10000)

  let authenticated = false
  let user: string | null = null
  let error: string | null = null

  if (result.exitCode === 0) {
    const output = result.stdout + result.stderr
    authenticated = /logged.in/i.test(output)
    // Extract auth method (e.g. "Logged in using ChatGPT" → "ChatGPT")
    const methodMatch = output.match(/logged\s+in\s+(?:using\s+)?(.+)/i)
    if (methodMatch) user = methodMatch[1].trim()
  } else {
    error = result.stderr || result.stdout || 'Auth check failed'
  }

  await setConfigValue('codex_cli_authenticated', authenticated ? 'true' : 'false')
  if (user) await setConfigValue('codex_cli_user', user)

  return { authenticated, user, error }
})

export const getCodexCliStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const path = await getConfigValue('codex_cli_path')
  const available = (await getConfigValue('codex_cli_available')) === 'true'
  const authenticated = (await getConfigValue('codex_cli_authenticated')) === 'true'
  const user = await getConfigValue('codex_cli_user')
  return { path, available, authenticated, user }
})

// ─── GitHub Copilot CLI (via `gh` + standalone `copilot`) ────────

export const detectGhCli = createServerFn({ method: 'POST' }).handler(async () => {
  const path = await findBinary('gh')
  const found = path !== null
  const version = found && path ? await getVersion(path) : null

  // Also detect standalone `copilot` binary
  const copilotPath = await findBinary('copilot')
  await setConfigValue('copilot_cli_path', copilotPath || '')

  await setConfigValue('gh_cli_path', path || '')
  await setConfigValue('gh_cli_available', found ? 'true' : 'false')

  return { found, path, version, copilotPath }
})

export const checkGhAuth = createServerFn({ method: 'POST' }).handler(async () => {
  const cliPath = await getConfigValue('gh_cli_path')
  if (!cliPath) return { authenticated: false, user: null, error: 'GitHub CLI not detected' }

  // `gh auth status` outputs text: "✓ Logged in to github.com account USERNAME (keyring)"
  const result = await runDirect(cliPath, ['auth', 'status'], 10000)

  let authenticated = false
  let user: string | null = null
  let error: string | null = null

  // gh auth status outputs to stderr and uses exit code 0 for logged-in
  const output = (result.stdout + ' ' + result.stderr).trim()

  if (result.exitCode === 0) {
    authenticated = /logged\s+in/i.test(output)
    // Extract username: "Logged in to github.com account USERNAME"
    const userMatch = output.match(/account\s+(\S+)/i)
    if (userMatch) user = userMatch[1]
  } else {
    error = output || 'Auth check failed'
  }

  await setConfigValue('gh_cli_authenticated', authenticated ? 'true' : 'false')
  if (user) await setConfigValue('gh_cli_user', user)

  return { authenticated, user, error }
})

export const getGhCliStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const path = await getConfigValue('gh_cli_path')
  const available = (await getConfigValue('gh_cli_available')) === 'true'
  const authenticated = (await getConfigValue('gh_cli_authenticated')) === 'true'
  const user = await getConfigValue('gh_cli_user')
  return { path, available, authenticated, user }
})

// ─── Detect all CLIs at once ─────────────────────────────────────

export const detectAllClis = createServerFn({ method: 'POST' }).handler(async () => {
  const [claude, codex, gh] = await Promise.all([
    detectClaudeCli(),
    detectCodexCli(),
    detectGhCli(),
  ])
  return { claude, codex, gh }
})

export const getAllCliStatuses = createServerFn({ method: 'GET' }).handler(async () => {
  const [claude, codex, gh] = await Promise.all([
    getClaudeCliStatus(),
    getCodexCliStatus(),
    getGhCliStatus(),
  ])
  return { claude, codex, gh }
})
