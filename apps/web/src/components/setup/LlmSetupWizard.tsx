import { useState, useCallback } from 'react'
import {
  Robot, CaretDown, CaretUp, CheckCircle, XCircle,
  CircleNotch, Terminal, ArrowClockwise, Copy,
} from '@phosphor-icons/react'
import { StatusPill } from '#/components/ui/StatusPill.tsx'
import {
  detectClaudeCli, checkClaudeAuth,
  detectCodexCli, checkCodexAuth,
  detectGhCli, checkGhAuth,
} from '#/lib/cli-detect.api.ts'
import type { CliStatusResult } from '#/lib/cli-detect.api.ts'
import { getLlmStatus } from '#/lib/llm.api.ts'
import { setAppConfig } from '#/lib/config.api.ts'
import { CliAuthModal } from './CliAuthModal.tsx'

type LlmServiceStatus = {
  connected: boolean
  status: string
  model_loaded?: boolean
  active_model?: string | null
}

export function LlmSetupWizard({
  initialCliStatuses,
  initialLlmStatus,
  initialSetupCompleted,
}: {
  initialCliStatuses: { claude: CliStatusResult; codex: CliStatusResult; gh: CliStatusResult }
  initialLlmStatus: LlmServiceStatus
  initialSetupCompleted: boolean
}) {
  const [guideOpen, setGuideOpen] = useState(!initialSetupCompleted)
  const [llmStatus, setLlmStatus] = useState<LlmServiceStatus>(initialLlmStatus)
  const [claude, setClaude] = useState(initialCliStatuses.claude)
  const [codex, setCodex] = useState(initialCliStatuses.codex)
  const [gh, setGh] = useState(initialCliStatuses.gh)
  const [detecting, setDetecting] = useState<string | null>(null)
  const [checkingAuth, setCheckingAuth] = useState<string | null>(null)
  const [checkingLlm, setCheckingLlm] = useState(false)
  const [setupCompleted, setSetupCompleted] = useState(initialSetupCompleted)
  const [authModal, setAuthModal] = useState<'claude' | 'codex' | 'gh' | null>(null)

  const handleDetectAll = useCallback(async () => {
    setDetecting('all')
    try {
      const [claudeRes, codexRes, ghRes] = await Promise.all([
        detectClaudeCli(),
        detectCodexCli(),
        detectGhCli(),
      ])
      const [claudeAuth, codexAuth, ghAuth] = await Promise.all([
        claudeRes.found ? checkClaudeAuth() : null,
        codexRes.found ? checkCodexAuth() : null,
        ghRes.found ? checkGhAuth() : null,
      ])
      setClaude({ path: claudeRes.path, available: claudeRes.found, authenticated: claudeAuth?.authenticated ?? false, user: claudeAuth?.user ?? null })
      setCodex({ path: codexRes.path, available: codexRes.found, authenticated: codexAuth?.authenticated ?? false, user: codexAuth?.user ?? null })
      setGh({ path: ghRes.path, available: ghRes.found, authenticated: ghAuth?.authenticated ?? false, user: ghAuth?.user ?? null })
    } catch { /* ignore */ } finally {
      setDetecting(null)
    }
  }, [])

  const handleCheckAuth = useCallback(async (cli: 'claude' | 'codex' | 'gh') => {
    setCheckingAuth(cli)
    try {
      if (cli === 'claude') {
        const r = await checkClaudeAuth()
        setClaude((prev) => ({ ...prev, authenticated: r.authenticated, user: r.user }))
      } else if (cli === 'codex') {
        const r = await checkCodexAuth()
        setCodex((prev) => ({ ...prev, authenticated: r.authenticated, user: r.user }))
      } else {
        const r = await checkGhAuth()
        setGh((prev) => ({ ...prev, authenticated: r.authenticated, user: r.user }))
      }
    } catch { /* ignore */ } finally {
      setCheckingAuth(null)
    }
  }, [])

  const handleCheckLlm = useCallback(async () => {
    setCheckingLlm(true)
    try {
      const result = await getLlmStatus()
      setLlmStatus(result as LlmServiceStatus)
    } catch {
      setLlmStatus({ connected: false, status: 'unreachable' })
    } finally {
      setCheckingLlm(false)
    }
  }, [])

  const handleCompleteSetup = useCallback(async () => {
    await setAppConfig({ data: { key: 'llm_setup_completed', value: 'true' } })
    setSetupCompleted(true)
  }, [])

  const anyCliAvailable = claude.available || codex.available || gh.available
  const isComplete = (llmStatus.connected || anyCliAvailable)

  return (
    <section className="island-shell mt-6 overflow-hidden rounded-2xl">
      <button
        onClick={() => setGuideOpen(!guideOpen)}
        className="flex w-full items-center justify-between p-6 text-left"
      >
        <div className="flex items-center gap-3">
          <Robot className="h-5 w-5 text-[var(--lagoon)]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">LLM Provider Setup</h2>
            <p className="text-sm text-[var(--sea-ink-soft)]">
              Local models, Claude, Codex, and GitHub Copilot CLI configuration
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill variant={isComplete ? 'success' : 'warning'}>
            {isComplete ? 'Ready' : 'Needs setup'}
          </StatusPill>
          {guideOpen ? (
            <CaretUp className="h-4 w-4 text-[var(--sea-ink-soft)]" />
          ) : (
            <CaretDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />
          )}
        </div>
      </button>

      {guideOpen && (
        <div className="space-y-6 border-t border-[var(--line)] p-6 pt-4">
          {/* Step 1: LLM Docker Service */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StepBadge n={1} />
                <span className="font-semibold text-[var(--sea-ink)]">Local LLM Service</span>
                <FoundBadge found={llmStatus.connected} foundLabel="Connected" notFoundLabel="Not running" />
              </div>
              <ReCheckButton loading={checkingLlm} onClick={handleCheckLlm} />
            </div>
            {llmStatus.connected ? (
              <div className="text-xs text-[var(--sea-ink-soft)]">
                {llmStatus.model_loaded
                  ? `Active model: ${llmStatus.active_model}`
                  : 'Service running — no model loaded yet. Select one in LLM Management below.'}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-[var(--sea-ink-soft)]">
                  The local LLM Docker service is not running. Start it with:
                </p>
                <CopyableCommand command="docker compose -f docker-compose.web.yml up llm -d" />
                <p className="text-xs text-[var(--sea-ink-soft)]">
                  Optional if you plan to use CLI providers instead.
                </p>
              </div>
            )}
          </div>

          {/* Step 2: CLI Providers */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StepBadge n={2} />
                <span className="font-semibold text-[var(--sea-ink)]">CLI Providers</span>
              </div>
              <button
                onClick={handleDetectAll}
                disabled={detecting !== null}
                className="flex items-center gap-1 text-xs font-medium text-[var(--lagoon-deep)] hover:underline disabled:opacity-50"
              >
                {detecting ? <CircleNotch className="h-3 w-3 animate-spin" /> : <ArrowClockwise className="h-3 w-3" />}
                {detecting ? 'Detecting...' : 'Detect all'}
              </button>
            </div>

            <div className="space-y-4">
              {/* Claude CLI */}
              <CliRow
                name="Claude"
                status={claude}
                checkingAuth={checkingAuth === 'claude'}
                onCheckAuth={() => handleCheckAuth('claude')}
                onLogin={() => setAuthModal('claude')}
                installCommands={['npm install -g @anthropic-ai/claude-code', 'brew install claude-code']}
                loginCommand="claude auth login"
              />

              {/* Codex CLI */}
              <CliRow
                name="Codex"
                status={codex}
                checkingAuth={checkingAuth === 'codex'}
                onCheckAuth={() => handleCheckAuth('codex')}
                onLogin={() => setAuthModal('codex')}
                installCommands={['npm install -g @openai/codex']}
                loginCommand="codex login"
              />

              {/* GitHub CLI (for Copilot) */}
              <CliRow
                name="GitHub CLI"
                subtitle="for Copilot"
                status={gh}
                checkingAuth={checkingAuth === 'gh'}
                onCheckAuth={() => handleCheckAuth('gh')}
                onLogin={() => setAuthModal('gh')}
                installCommands={['brew install gh']}
                loginCommand="gh auth login --web"
              />
            </div>
          </div>

          {/* Step 3: Summary */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <StepBadge n={3} />
              <span className="font-semibold text-[var(--sea-ink)]">Summary</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <ChecklistItem ok={llmStatus.connected} label="Local LLM service" optional />
              <ChecklistItem ok={claude.available && claude.authenticated} label="Claude CLI" optional />
              <ChecklistItem ok={codex.available && codex.authenticated} label="Codex CLI" optional />
              <ChecklistItem ok={gh.available && gh.authenticated} label="GitHub CLI" optional />
              <ChecklistItem ok={isComplete} label="At least one provider available" />
            </div>

            {!setupCompleted && (
              <button
                onClick={handleCompleteSetup}
                disabled={!isComplete}
                className="mt-4 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                Complete LLM Setup
              </button>
            )}
            {setupCompleted && (
              <p className="mt-3 text-xs font-medium text-green-600">Setup complete. You can reconfigure anytime.</p>
            )}
          </div>
        </div>
      )}
      {/* Auth Modal */}
      {authModal && (
        <CliAuthModal
          cli={authModal}
          onClose={() => setAuthModal(null)}
          onSuccess={() => {
            setAuthModal(null)
            // Re-check auth for the CLI that just logged in
            handleCheckAuth(authModal)
          }}
        />
      )}
    </section>
  )
}

// ─── Sub-components ──────────────────────────────────────────────

function CliRow({
  name,
  subtitle,
  status,
  checkingAuth,
  onCheckAuth,
  onLogin,
  installCommands,
  loginCommand,
}: {
  name: string
  subtitle?: string
  status: CliStatusResult
  checkingAuth: boolean
  onCheckAuth: () => void
  onLogin: () => void
  installCommands: string[]
  loginCommand: string
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium text-[var(--sea-ink)]">{name}</span>
        {subtitle && <span className="text-xs text-[var(--sea-ink-soft)]">({subtitle})</span>}
        <FoundBadge found={status.available} />
      </div>

      {status.available ? (
        <div className="space-y-1.5">
          <div className="text-xs text-[var(--sea-ink-soft)]">
            Path: <code className="rounded bg-[var(--surface)] px-1.5 py-0.5">{status.path}</code>
          </div>
          <div className="flex items-center gap-2">
            {status.authenticated ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" /> Authenticated{status.user ? ` (${status.user})` : ''}
              </span>
            ) : (
              <>
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <XCircle className="h-3 w-3" /> Not authenticated
                </span>
                <button
                  onClick={onCheckAuth}
                  disabled={checkingAuth}
                  className="text-xs font-medium text-[var(--lagoon-deep)] hover:underline disabled:opacity-50"
                >
                  {checkingAuth ? 'Checking...' : 'Re-check'}
                </button>
              </>
            )}
          </div>
          {!status.authenticated && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={onLogin}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--lagoon)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--lagoon-deep)]"
              >
                <Terminal className="h-3.5 w-3.5" />
                Login in Terminal
              </button>
              <span className="text-xs text-[var(--sea-ink-soft)]">
                or run: <code className="rounded bg-[var(--surface)] px-1 py-0.5">{loginCommand}</code>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-[var(--sea-ink-soft)]">Not found. Install with:</p>
          {installCommands.map((cmd, i) => (
            <div key={i}>
              {i > 0 && <p className="my-0.5 text-xs text-[var(--sea-ink-soft)]">or</p>}
              <CopyableCommand command={cmd} />
            </div>
          ))}
          <p className="text-xs text-[var(--sea-ink-soft)]">Then click "Detect all" above.</p>
        </div>
      )}
    </div>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--lagoon)] text-xs font-bold text-white">{n}</span>
  )
}

function FoundBadge({ found, foundLabel = 'Found', notFoundLabel = 'Not found' }: { found: boolean; foundLabel?: string; notFoundLabel?: string }) {
  return found ? (
    <span className="flex items-center gap-1 text-xs text-green-600">
      <CheckCircle className="h-3 w-3" /> {foundLabel}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-amber-600">
      <XCircle className="h-3 w-3" /> {notFoundLabel}
    </span>
  )
}

function ReCheckButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1 text-xs font-medium text-[var(--lagoon-deep)] hover:underline disabled:opacity-50"
    >
      {loading ? <CircleNotch className="h-3 w-3 animate-spin" /> : <ArrowClockwise className="h-3 w-3" />}
      Re-check
    </button>
  )
}

function ChecklistItem({ ok, label, optional }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle className="h-3.5 w-3.5 text-green-600" weight="fill" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-[var(--sea-ink-soft)]" />
      )}
      <span className={ok ? 'text-[var(--sea-ink)]' : 'text-[var(--sea-ink-soft)]'}>
        {label}
        {optional && !ok && <span className="ml-1 text-[var(--sea-ink-soft)]">(optional)</span>}
      </span>
    </div>
  )
}

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-strong)] px-3 py-2">
      <Terminal className="h-3.5 w-3.5 shrink-0 text-[var(--sea-ink-soft)]" />
      <code className="flex-1 text-xs text-[var(--sea-ink)]">{command}</code>
      <button
        onClick={handleCopy}
        className="shrink-0 text-[var(--lagoon-deep)] hover:text-[var(--lagoon)]"
        title="Copy to clipboard"
      >
        {copied ? (
          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
}
