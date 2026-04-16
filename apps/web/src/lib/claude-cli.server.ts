import { getConfigValue } from './config.server.ts'

// ─── Progress tracking ───────────────────────────────────────────

export interface CliProgress {
  step: string
  startedAt: number
  elapsedMs: number
}

const progressMap = new Map<string, CliProgress>()

export function setCliProgress(sessionId: string, step: string) {
  const existing = progressMap.get(sessionId)
  progressMap.set(sessionId, {
    step,
    startedAt: existing?.startedAt || Date.now(),
    elapsedMs: Date.now() - (existing?.startedAt || Date.now()),
  })
}

export function getCliProgress(sessionId: string): CliProgress | null {
  const p = progressMap.get(sessionId)
  if (p) p.elapsedMs = Date.now() - p.startedAt
  return p || null
}

export function clearCliProgress(sessionId: string) {
  progressMap.delete(sessionId)
}

// ─── Claude CLI execution ────────────────────────────────────────

/**
 * Call the Claude CLI directly from the web server.
 * Bypasses the Python LLM service entirely — no Docker needed.
 *
 * Spawns: claude -p --output-format json --model <model>
 * Passes the prompt via stdin, parses JSON response from stdout.
 */
export async function callClaudeCli(
  prompt: string,
  options?: { sessionId?: string },
): Promise<{ text: string; inputTokens: number; outputTokens: number; durationMs: number }> {
  const cliPath = await getConfigValue('claude_cli_path')
  if (!cliPath) throw new Error('Claude CLI not configured. Run CLI detection first.')

  const modelId = (await getConfigValue('active_model_id')) || 'claude-sonnet-4-20250514'
  const model = modelId.replace(/^claude\//, '')
  const sid = options?.sessionId || crypto.randomUUID()

  setCliProgress(sid, `Sending ${Math.round(prompt.length / 1024)}KB to ${model}...`)
  console.log(`[claude-cli] Spawning: ${cliPath} -p --output-format json --model ${model}`)
  console.log(`[claude-cli] Prompt size: ${prompt.length} chars (${Math.round(prompt.length / 1024)}KB)`)

  const startMs = Date.now()

  // Write prompt to a temp file to avoid stdin pipe issues with large prompts.
  // Bun's Blob stdin can cause empty `result` fields when the prompt is large.
  const tmpFile = `/tmp/claude-prompt-${sid}.txt`
  await Bun.write(tmpFile, prompt)

  const proc = Bun.spawn(
    ['sh', '-c', `cat "${tmpFile}" | "${cliPath}" -p --output-format json --model "${model}"`],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  const timeout = setTimeout(() => {
    console.log(`[claude-cli] Timeout — killing process after 180s`)
    proc.kill()
  }, 180_000)

  setCliProgress(sid, `Waiting for ${model} response...`)

  // Collect stdout chunks incrementally so we can track progress
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  const readStream = async (stream: ReadableStream<Uint8Array>, chunks: string[]) => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value, { stream: true }))
      }
    } catch { /* stream ended */ }
  }

  await Promise.all([
    readStream(proc.stdout as ReadableStream<Uint8Array>, stdoutChunks),
    readStream(proc.stderr as ReadableStream<Uint8Array>, stderrChunks),
  ])

  clearTimeout(timeout)
  const exitCode = await proc.exited

  // Clean up temp file
  try { await Bun.file(tmpFile).exists() && (await import('node:fs/promises')).unlink(tmpFile) } catch { /* ignore */ }

  const stdout = stdoutChunks.join('')
  const stderr = stderrChunks.join('')
  const durationMs = Date.now() - startMs

  console.log(`[claude-cli] Completed in ${(durationMs / 1000).toFixed(1)}s, exit=${exitCode}, stdout=${stdout.length} bytes`)

  if (exitCode !== 0) {
    const errTail = (stderr || stdout).slice(-500)
    clearCliProgress(sid)
    throw new Error(`Claude CLI exited with code ${exitCode}: ${errTail}`)
  }

  if (!stdout.trim()) {
    clearCliProgress(sid)
    throw new Error('Claude CLI returned empty output')
  }

  setCliProgress(sid, 'Parsing response...')

  // Parse JSON response
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stdout)
  } catch {
    // Try last line (NDJSON)
    const lines = stdout.trim().split('\n').filter(Boolean)
    if (lines.length === 0) {
      clearCliProgress(sid)
      throw new Error('Empty output from Claude CLI')
    }
    try {
      parsed = JSON.parse(lines[lines.length - 1])
    } catch {
      clearCliProgress(sid)
      throw new Error(`Failed to parse Claude CLI output as JSON. First 500 chars: ${stdout.slice(0, 500)}`)
    }
  }

  // Check for error responses
  if (parsed.is_error === true) {
    console.log(`[claude-cli] CLI returned error response:`, JSON.stringify(parsed).slice(0, 500))
    clearCliProgress(sid)
    const errorMsg = (parsed.result as string) || (parsed.error as string) || 'Unknown CLI error'
    throw new Error(`Claude CLI error: ${errorMsg}`)
  }

  // Log full response keys for debugging
  console.log(`[claude-cli] Response keys: [${Object.keys(parsed).join(', ')}]`)
  console.log(`[claude-cli] type=${parsed.type}, subtype=${parsed.subtype}, is_error=${parsed.is_error}`)

  let text = ''

  // Try known fields in order of likelihood
  if (typeof parsed.result === 'string' && parsed.result.length > 0) {
    text = parsed.result
  } else if (typeof parsed.content === 'string' && parsed.content.length > 0) {
    text = parsed.content
  } else if (typeof parsed.text === 'string' && parsed.text.length > 0) {
    text = parsed.text
  }

  if (!text) {
    // Last resort: stringify everything except metadata fields
    console.log(`[claude-cli] No text found. Full response:`, stdout.slice(0, 1500))
    clearCliProgress(sid)
    throw new Error(
      `No text in Claude CLI response. ` +
      `Keys: [${Object.keys(parsed).join(', ')}]. ` +
      `type=${parsed.type}, subtype=${parsed.subtype}. ` +
      `result type: ${typeof parsed.result}, result value: ${JSON.stringify(parsed.result).slice(0, 200)}`
    )
  }

  const usage = (parsed.usage || {}) as Record<string, number>

  console.log(`[claude-cli] Got ${text.length} chars, ${usage.input_tokens || 0}+${usage.output_tokens || 0} tokens`)

  setCliProgress(sid, 'Done')
  clearCliProgress(sid)

  return {
    text: text.trim(),
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    durationMs,
  }
}

// ─── GitHub Copilot CLI execution ────────────────────────────────

/**
 * Call the GitHub Copilot CLI directly from the web server.
 * Copilot uses NDJSON output — concatenate assistant.message events.
 *
 * Spawns: copilot -p <prompt> --output-format json --model <model>
 * Requires GH_TOKEN env var (from `gh auth token`).
 */
export async function callCopilotCli(
  prompt: string,
  options?: { sessionId?: string; model?: string },
): Promise<{ text: string; inputTokens: number; outputTokens: number; durationMs: number }> {
  const cliPath = await getConfigValue('gh_cli_path')
  if (!cliPath) throw new Error('GitHub CLI not configured. Run CLI detection first.')

  // Get the copilot binary — try standalone `copilot` first, fall back to `gh copilot`
  const copilotPath = await getConfigValue('copilot_cli_path')

  const model = options?.model || 'gpt-4.1'
  const sid = options?.sessionId || crypto.randomUUID()

  // Get GH token for auth
  setCliProgress(sid, 'Getting GitHub auth token...')
  let ghToken: string | undefined
  try {
    const tokenProc = Bun.spawn([cliPath, 'auth', 'token'], { stdout: 'pipe', stderr: 'pipe' })
    ghToken = (await new Response(tokenProc.stdout).text()).trim()
    await tokenProc.exited
  } catch {
    // will fail later with auth error
  }

  // Write prompt to temp file (same approach as Claude for large prompts)
  const tmpFile = `/tmp/copilot-prompt-${sid}.txt`
  await Bun.write(tmpFile, prompt)

  // Determine how to invoke copilot
  // If standalone `copilot` binary exists, use it directly
  // Otherwise use `gh copilot` subcommand
  let spawnCmd: string
  if (copilotPath) {
    spawnCmd = `"${copilotPath}" -p "$(cat "${tmpFile}")" --output-format json --model "${model}"`
  } else {
    spawnCmd = `"${cliPath}" copilot -p "$(cat "${tmpFile}")" --output-format json --model "${model}"`
  }

  setCliProgress(sid, `Sending ${Math.round(prompt.length / 1024)}KB to Copilot ${model}...`)
  console.log(`[copilot-cli] Spawning: ${spawnCmd.slice(0, 120)}...`)
  console.log(`[copilot-cli] Prompt size: ${prompt.length} chars (${Math.round(prompt.length / 1024)}KB)`)

  const startMs = Date.now()

  const proc = Bun.spawn(['sh', '-c', spawnCmd], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...(ghToken ? { GH_TOKEN: ghToken } : {}) },
  })

  const timeout = setTimeout(() => {
    console.log(`[copilot-cli] Timeout — killing process after 180s`)
    proc.kill()
  }, 180_000)

  setCliProgress(sid, `Waiting for Copilot ${model} response...`)

  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  const readStream = async (stream: ReadableStream<Uint8Array>, chunks: string[]) => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value, { stream: true }))
      }
    } catch { /* stream ended */ }
  }

  await Promise.all([
    readStream(proc.stdout as ReadableStream<Uint8Array>, stdoutChunks),
    readStream(proc.stderr as ReadableStream<Uint8Array>, stderrChunks),
  ])

  clearTimeout(timeout)
  const exitCode = await proc.exited

  // Clean up temp file
  try { await Bun.file(tmpFile).exists() && (await import('node:fs/promises')).unlink(tmpFile) } catch { /* ignore */ }

  const stdout = stdoutChunks.join('')
  const stderr = stderrChunks.join('')
  const durationMs = Date.now() - startMs

  console.log(`[copilot-cli] Completed in ${(durationMs / 1000).toFixed(1)}s, exit=${exitCode}, stdout=${stdout.length} bytes`)

  if (exitCode !== 0) {
    const errTail = (stderr || stdout).slice(-500)
    clearCliProgress(sid)
    throw new Error(`Copilot CLI exited with code ${exitCode}: ${errTail}`)
  }

  setCliProgress(sid, 'Parsing NDJSON response...')

  // Parse NDJSON output — concatenate assistant.message content
  let text = ''
  let totalOutputTokens = 0
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      if (event.type === 'assistant.message' && event.data?.content) {
        text += event.data.content
        if (event.data.outputTokens) totalOutputTokens += event.data.outputTokens
      }
    } catch {
      // skip unparseable lines
    }
  }

  if (!text) {
    console.log(`[copilot-cli] No text extracted from NDJSON. Raw stdout:`, stdout.slice(0, 1000))
    clearCliProgress(sid)
    throw new Error(`No content in Copilot CLI response. stdout: ${stdout.slice(0, 300)}`)
  }

  console.log(`[copilot-cli] Got ${text.length} chars, ${totalOutputTokens} output tokens`)

  setCliProgress(sid, 'Done')
  clearCliProgress(sid)

  return {
    text: text.trim(),
    inputTokens: 0, // Copilot doesn't report input tokens
    outputTokens: totalOutputTokens,
    durationMs,
  }
}

// ─── Codex CLI execution ────────────────────────────────────────

/**
 * Call the Codex CLI directly from the web server.
 * Spawns: codex exec --json -m <model> -
 * Reads prompt from stdin, parses JSONL output.
 */
export async function callCodexCli(
  prompt: string,
  options?: { sessionId?: string; model?: string },
): Promise<{ text: string; inputTokens: number; outputTokens: number; durationMs: number }> {
  const cliPath = await getConfigValue('codex_cli_path')
  if (!cliPath) throw new Error('Codex CLI not configured. Run CLI detection first.')

  const model = options?.model || undefined // use codex default if not specified
  const sid = options?.sessionId || crypto.randomUUID()

  const args = [cliPath, 'exec', '--json']
  if (model) args.push('-m', model)
  args.push('-') // read prompt from stdin

  setCliProgress(sid, `Sending ${Math.round(prompt.length / 1024)}KB to Codex${model ? ` ${model}` : ''}...`)
  console.log(`[codex-cli] Spawning: ${args.join(' ')}`)
  console.log(`[codex-cli] Prompt size: ${prompt.length} chars (${Math.round(prompt.length / 1024)}KB)`)

  const startMs = Date.now()

  const proc = Bun.spawn(args, {
    stdin: new Response(prompt),
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const timeout = setTimeout(() => {
    console.log(`[codex-cli] Timeout — killing process after 180s`)
    proc.kill()
  }, 180_000)

  setCliProgress(sid, 'Waiting for Codex response...')

  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  const readStream = async (stream: ReadableStream<Uint8Array>, chunks: string[]) => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value, { stream: true }))
      }
    } catch { /* stream ended */ }
  }

  await Promise.all([
    readStream(proc.stdout as ReadableStream<Uint8Array>, stdoutChunks),
    readStream(proc.stderr as ReadableStream<Uint8Array>, stderrChunks),
  ])

  clearTimeout(timeout)
  const exitCode = await proc.exited

  const stdout = stdoutChunks.join('')
  const stderr = stderrChunks.join('')
  const durationMs = Date.now() - startMs

  console.log(`[codex-cli] Completed in ${(durationMs / 1000).toFixed(1)}s, exit=${exitCode}, stdout=${stdout.length} bytes`)

  if (exitCode !== 0) {
    const errTail = (stderr || stdout).slice(-500)
    clearCliProgress(sid)
    throw new Error(`Codex CLI exited with code ${exitCode}: ${errTail}`)
  }

  // Parse JSONL: extract agent_message text and usage
  let text = ''
  let inputTokens = 0
  let outputTokens = 0
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
        text += event.item.text
      }
      if (event.type === 'turn.completed' && event.usage) {
        inputTokens += event.usage.input_tokens || 0
        outputTokens += event.usage.output_tokens || 0
      }
      if (event.type === 'error') {
        console.log(`[codex-cli] Error event: ${event.message}`)
      }
    } catch { /* skip */ }
  }

  if (!text) {
    console.log(`[codex-cli] No text extracted from JSONL. Raw stdout:`, stdout.slice(0, 1000))
    clearCliProgress(sid)
    throw new Error(`No content in Codex CLI response. stdout: ${stdout.slice(0, 300)}`)
  }

  console.log(`[codex-cli] Got ${text.length} chars, ${inputTokens}+${outputTokens} tokens`)
  setCliProgress(sid, 'Done')
  clearCliProgress(sid)

  return { text: text.trim(), inputTokens, outputTokens, durationMs }
}

// ─── Provider detection helpers ──────────────────────────────────

/**
 * Check if Claude CLI should be used for generation.
 * Returns true if:
 * - Explicitly set as active provider, OR
 * - No active provider is set but Claude CLI is available and authenticated
 *   (fallback so it works without explicit selection)
 */
export async function isClaudeCliActive(): Promise<boolean> {
  const provider = await getConfigValue('active_provider')
  const cliPath = await getConfigValue('claude_cli_path')
  const authenticated = await getConfigValue('claude_cli_authenticated')

  if (!cliPath || authenticated !== 'true') return false

  // Explicitly selected
  if (provider === 'claude') return true

  // Fallback: no provider set but CLI is ready — use it rather than failing
  if (!provider || provider === '') return true

  return false
}

/** Check if GitHub Copilot CLI should be used for generation. */
export async function isCopilotCliActive(): Promise<boolean> {
  const provider = await getConfigValue('active_provider')
  const ghPath = await getConfigValue('gh_cli_path')
  const authenticated = await getConfigValue('gh_cli_authenticated')

  return provider === 'copilot' && !!ghPath && authenticated === 'true'
}

/** Returns which CLI provider is active: 'claude' | 'copilot' | 'codex' | 'local' | null */
export async function getActiveCliProvider(): Promise<'claude' | 'copilot' | 'codex' | 'local' | null> {
  const provider = await getConfigValue('active_provider')

  if (provider === 'copilot') {
    const ghPath = await getConfigValue('gh_cli_path')
    const authenticated = await getConfigValue('gh_cli_authenticated')
    if (ghPath && authenticated === 'true') return 'copilot'
  }

  if (provider === 'codex') {
    const codexPath = await getConfigValue('codex_cli_path')
    const authenticated = await getConfigValue('codex_cli_authenticated')
    if (codexPath && authenticated === 'true') return 'codex'
  }

  if (provider === 'claude' || !provider || provider === '') {
    const cliPath = await getConfigValue('claude_cli_path')
    const authenticated = await getConfigValue('claude_cli_authenticated')
    if (cliPath && authenticated === 'true') return 'claude'
  }

  if (provider === 'local') return 'local'

  return null
}
