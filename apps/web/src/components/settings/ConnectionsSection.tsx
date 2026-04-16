import { useState, useCallback } from 'react'
import {
  EnvelopeSimple, Table, ArrowSquareOut, FolderOpen,
  CheckCircle, XCircle, CircleNotch, LinkedinLogo,
  SignOut, GoogleLogo,
} from '@phosphor-icons/react'
import { testLinkedInLogin, getLinkedInCredentialsStatus, saveLinkedInCredentials } from '#/lib/playwright.api.ts'
import { disconnectGmailAccount } from '#/lib/gmail.api.ts'
import { useBotStream } from '#/hooks/useBotStream.ts'
import { BotViewerPanel } from '#/components/ui/BotViewerPanel.tsx'

type ConnectionsSectionProps = {
  gmailStatus: { connected: boolean; configured: boolean; authUrl: string | null; savedEmailCount: number }
  sheetsStatus: { configured: boolean; authenticated: boolean; sheetUrl?: string | null }
  linkedInCredentialsStatus: Awaited<ReturnType<typeof getLinkedInCredentialsStatus>>
  workspaceConfigured?: boolean
}

export function ConnectionsSection({ gmailStatus, sheetsStatus, linkedInCredentialsStatus, workspaceConfigured }: ConnectionsSectionProps) {
  return (
    <section className="island-shell mb-6 mt-6 rounded-2xl p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        Connections
      </h2>
      <div className="space-y-3">
        {/* Gmail / Google */}
        <GoogleConnectionRow gmailStatus={gmailStatus} sheetsStatus={sheetsStatus} workspaceConfigured={workspaceConfigured} />

        {/* LinkedIn */}
        <LinkedInConnectionRow initialCredentialsStatus={linkedInCredentialsStatus} />
      </div>
    </section>
  )
}

function GoogleConnectionRow({
  gmailStatus,
  sheetsStatus,
  workspaceConfigured,
}: {
  gmailStatus: ConnectionsSectionProps['gmailStatus']
  sheetsStatus: ConnectionsSectionProps['sheetsStatus']
  workspaceConfigured?: boolean
}) {
  const [disconnecting, setDisconnecting] = useState(false)
  const [connected, setConnected] = useState(gmailStatus.connected)

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await disconnectGmailAccount()
      setConnected(false)
    } catch {
      // silently fail, user can retry
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-3">
        <GoogleLogo className="h-5 w-5 shrink-0 text-[var(--lagoon)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--sea-ink)]">Google</span>
            {connected ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-[var(--sea-ink-soft)]">
                <XCircle className="h-3 w-3" /> Not connected
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--sea-ink-soft)]">
            <span className="flex items-center gap-1">
              <EnvelopeSimple className="h-3 w-3" />
              Gmail {connected ? '(active)' : '(inactive)'}
            </span>
            <span className="flex items-center gap-1">
              <Table className="h-3 w-3" />
              Sheets {sheetsStatus.configured && sheetsStatus.authenticated ? '(active)' : '(inactive)'}
            </span>
            <span className="flex items-center gap-1">
              <FolderOpen className="h-3 w-3" />
              Drive {workspaceConfigured ? '(active)' : '(inactive)'}
            </span>
          </div>
          {gmailStatus.savedEmailCount > 0 && (
            <div className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
              {gmailStatus.savedEmailCount} emails scanned
            </div>
          )}
          {sheetsStatus.sheetUrl && (
            <a
              href={sheetsStatus.sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block truncate text-xs text-[var(--lagoon-deep)] hover:underline"
            >
              {sheetsStatus.sheetUrl} <ArrowSquareOut className="mb-0.5 inline h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
            >
              <SignOut className="h-3 w-3" />
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : gmailStatus.authUrl ? (
            <a
              href={gmailStatus.authUrl}
              className="flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              <GoogleLogo className="h-3 w-3" />
              Connect Google
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

type LinkedInCredentialsStatus = Awaited<ReturnType<typeof getLinkedInCredentialsStatus>>

const LOGIN_STREAM_URL = (sessionId: string) => `/api/pw-stream/stream/${sessionId}`

const LOGIN_STAGE_LABELS: Record<string, string> = {
  opening: 'Opening LinkedIn...',
  checking_login: 'Checking login status...',
  logging_in: 'Attempting login...',
  verification_pending: 'Awaiting verification...',
  done: 'Complete',
}

function LinkedInConnectionRow({ initialCredentialsStatus }: { initialCredentialsStatus: LinkedInCredentialsStatus }) {
  const [status, setStatus] = useState<'idle' | 'testing' | 'verifying' | 'connected' | 'failed' | 'not_configured' | 'captcha_blocked' | 'verification_pending'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [credentialsStatus, setCredentialsStatus] = useState(initialCredentialsStatus)
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null)
  const botStream = useBotStream(streamSessionId, LOGIN_STREAM_URL)

  const isTesting = status === 'testing' || status === 'verifying'

  const handleSave = async () => {
    if (!email.trim() || !password.trim()) {
      setStatus('failed')
      setMessage('Enter both email and password to save LinkedIn credentials.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await saveLinkedInCredentials({ data: { email: email.trim(), password: password.trim() } })
      const refreshed = await getLinkedInCredentialsStatus()
      setCredentialsStatus(refreshed)
      setPassword('')
      setStatus('idle')
      setMessage('LinkedIn credentials saved.')
    } catch (err) {
      setStatus('failed')
      setMessage(err instanceof Error ? err.message : 'Failed to save LinkedIn credentials')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = useCallback(async () => {
    setStatus('testing')
    setMessage(null)
    const sid = crypto.randomUUID()
    setStreamSessionId(sid)
    // Small delay to let EventSource connect before the POST fires
    await new Promise((r) => setTimeout(r, 300))
    try {
      const res = await testLinkedInLogin({ data: { waitForVerification: false, sessionId: sid } })
      setStatus(res.status as typeof status)
      setMessage(res.message)
    } catch (err) {
      setStatus('failed')
      setMessage(err instanceof Error ? err.message : 'Connection test failed')
    } finally {
      setStreamSessionId(null)
    }
  }, [])

  const handleVerify = useCallback(async () => {
    setStatus('verifying')
    setMessage('Waiting for you to approve on your LinkedIn app (up to 60s)...')
    const sid = crypto.randomUUID()
    setStreamSessionId(sid)
    await new Promise((r) => setTimeout(r, 300))
    try {
      const res = await testLinkedInLogin({ data: { waitForVerification: true, sessionId: sid } })
      setStatus(res.status as typeof status)
      setMessage(res.message)
    } catch (err) {
      setStatus('failed')
      setMessage(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setStreamSessionId(null)
    }
  }, [])

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center gap-3">
      <LinkedinLogo className="h-5 w-5 shrink-0 text-[var(--lagoon)]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--sea-ink)]">LinkedIn</span>
          {status === 'connected' ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="h-3 w-3" /> Connected
            </span>
          ) : status === 'not_configured' ? (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <XCircle className="h-3 w-3" /> Not configured
            </span>
          ) : status === 'captcha_blocked' ? (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <XCircle className="h-3 w-3" /> Captcha required
            </span>
          ) : status === 'verification_pending' ? (
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <CircleNotch className="h-3 w-3" /> Awaiting approval
            </span>
          ) : status === 'failed' ? (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <XCircle className="h-3 w-3" /> Failed
            </span>
          ) : null}
        </div>
        {message && (
          <div className="text-xs text-[var(--sea-ink-soft)]">{message}</div>
        )}
        {credentialsStatus.configured && (
          <div className="text-xs text-[var(--sea-ink-soft)]">
            Using {credentialsStatus.source === 'settings' ? 'saved settings' : '.env fallback'} credentials: {credentialsStatus.maskedEmail}
          </div>
        )}
      </div>
      </div>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="LinkedIn email"
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="LinkedIn password"
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={saving || status === 'testing' || status === 'verifying'}
          className="rounded-lg border border-[var(--lagoon)] px-3 py-2 text-sm font-medium text-[var(--lagoon-deep)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Credentials'}
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status === 'verification_pending' && (
          <button
            onClick={handleVerify}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            <CheckCircle className="h-3 w-3" />
            I Approved It
          </button>
        )}
        <button
          onClick={handleTest}
          disabled={saving || isTesting}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--lagoon-deep)] hover:underline disabled:opacity-50"
        >
          {isTesting ? (
            <>
              <CircleNotch className="h-3 w-3 animate-spin" />
              {status === 'verifying' ? 'Waiting...' : 'Testing...'}
            </>
          ) : (
            <>
              <LinkedinLogo className="h-3 w-3" />
              Test Login
            </>
          )}
        </button>
      </div>
      {(isTesting || botStream.done) && (
        <BotViewerPanel
          stream={botStream}
          isSearching={isTesting}
          title="LinkedIn Login"
          stageLabels={LOGIN_STAGE_LABELS}
        />
      )}
    </div>
  )
}
