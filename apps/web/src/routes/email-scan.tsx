import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import {
  Inbox, Search, Link2, Unlink, CheckCircle, XCircle,
  MessageSquare, Loader2, ChevronDown, ChevronUp, Mail,
} from 'lucide-react'
import { getJobs } from '#/lib/jobs.api.ts'
import { getGmailStatus, scanOneCompany, getSavedEmails, disconnectGmailAccount } from '#/lib/gmail.api.ts'
import type { ScanResult, ScannedEmail } from '#/lib/gmail.server.ts'
import { ProgressBar, StatCard, ErrorAlert } from '#/components/ui/index.ts'
import { requireAuth } from '#/lib/auth-guard.ts'

export const Route = createFileRoute('/email-scan')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [jobs, gmailStatus, savedEmails] = await Promise.all([
      getJobs(),
      getGmailStatus(),
      getSavedEmails(),
    ])
    return { jobs, gmailStatus, savedEmails }
  },
  component: EmailScan,
})

function EmailScan() {
  const { jobs, gmailStatus: initialStatus, savedEmails } = Route.useLoaderData()
  const configured = initialStatus.configured
  const [connected, setConnected] = useState(initialStatus.connected)
  const [authUrl] = useState(initialStatus.authUrl)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, currentCompany: '' })
  const [results, setResults] = useState<ScanResult[] | null>(
    savedEmails.length > 0 ? savedEmails : null,
  )
  const [lastScanWasLive, setLastScanWasLive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const companies = [...new Set(jobs.map((j) => j.company).filter(Boolean))]

  const handleScan = useCallback(async () => {
    setScanning(true)
    setError(null)
    setResults([])
    setLastScanWasLive(true)
    setScanProgress({ current: 0, total: companies.length, currentCompany: '' })

    const accumulated: ScanResult[] = []

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i]!
      setScanProgress({ current: i, total: companies.length, currentCompany: company })

      try {
        const result = await scanOneCompany({ data: { company } })
        if (result.emails.length > 0) {
          accumulated.push(result)
          setResults([...accumulated])
        }
      } catch (e) {
        console.error(`Failed to scan ${company}:`, e)
      }
    }

    setScanProgress({ current: companies.length, total: companies.length, currentCompany: '' })
    setScanning(false)
  }, [companies])

  const handleDisconnect = useCallback(async () => {
    await disconnectGmailAccount()
    setConnected(false)
    setResults(null)
  }, [])

  const allResults = results ?? []
  const rejections = allResults.filter((r) => r.suggestedStatus === 'rejection')
  const interviews = allResults.filter((r) => r.suggestedStatus === 'interview')
  const applied = allResults.filter((r) => r.suggestedStatus === 'applied')
  const other = allResults.filter((r) => r.suggestedStatus === null)
  const totalEmails = allResults.reduce((sum, r) => sum + r.emails.length, 0)

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <Inbox className="h-6 w-6 text-[var(--lagoon)]" />
        Email Scanner
      </h1>
      <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
        Scan your Gmail for rejection and interview emails to auto-update job statuses.
      </p>

      {/* Connection status */}
      <section className="island-shell mb-6 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-[var(--lagoon)]" />
            <div>
              <div className="font-semibold text-[var(--sea-ink)]">Gmail Connection</div>
              <div className="text-sm text-[var(--sea-ink-soft)]">
                {!configured
                  ? 'Google API credentials not configured. See setup instructions below.'
                  : connected
                    ? 'Your Gmail account is connected (read-only access).'
                    : 'Connect your Gmail to scan for application responses.'}
              </div>
            </div>
          </div>
          {connected ? (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
            >
              <Unlink className="h-3.5 w-3.5" />
              Disconnect
            </button>
          ) : configured ? (
            <a
              href={authUrl ?? '#'}
              className="flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white no-underline transition hover:opacity-90"
            >
              <Link2 className="h-3.5 w-3.5" />
              Connect Gmail
            </a>
          ) : null}
        </div>
      </section>

      {/* Scan controls */}
      {connected && (
        <section className="mb-6">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-full bg-[var(--lagoon)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {scanning ? 'Scanning emails...' : `Scan Emails (${companies.length} companies)`}
          </button>

          {/* Progress bar during scan */}
          {scanning && (
            <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <ProgressBar
                current={scanProgress.current}
                total={scanProgress.total}
                label={scanProgress.currentCompany
                  ? `Scanning: ${scanProgress.currentCompany}`
                  : 'Starting scan...'}
              />
            </div>
          )}

          {error && <div className="mt-3"><ErrorAlert message={error} /></div>}
        </section>
      )}

      {/* Results */}
      {allResults.length > 0 && (
        <>
          {/* Source indicator */}
          <div className="mb-4 rounded-lg bg-[var(--surface)] px-4 py-2 text-xs text-[var(--sea-ink-soft)]">
            {scanning
              ? `Scanning... ${totalEmails} emails found so far across ${allResults.length} companies`
              : lastScanWasLive
                ? `Live scan results — ${totalEmails} emails across ${allResults.length} companies (saved to database)`
                : `Showing ${totalEmails} previously scanned emails across ${allResults.length} companies`}
          </div>

          {/* Summary */}
          <section className="mb-6 grid grid-cols-4 gap-3">
            <StatCard label="Rejections" value={rejections.length} colorClass="bg-red-500/10 text-red-700" />
            <StatCard label="Interviews" value={interviews.length} colorClass="bg-purple-500/10 text-purple-700" />
            <StatCard label="Applied" value={applied.length} colorClass="bg-blue-500/10 text-blue-700" />
            <StatCard label="Other" value={other.length} colorClass="bg-gray-500/10 text-gray-600" />
          </section>

          {/* Rejections */}
          {rejections.length > 0 && (
            <ResultSection
              title="Rejections"
              icon={<XCircle className="h-5 w-5 text-red-600" />}
              results={rejections}
              colorClass="border-red-200"
            />
          )}

          {/* Interviews */}
          {interviews.length > 0 && (
            <ResultSection
              title="Interview / Positive Signals"
              icon={<CheckCircle className="h-5 w-5 text-purple-600" />}
              results={interviews}
              colorClass="border-purple-200"
            />
          )}

          {/* Applied */}
          {applied.length > 0 && (
            <ResultSection
              title="Applied / Acknowledgments"
              icon={<Mail className="h-5 w-5 text-blue-600" />}
              results={applied}
              colorClass="border-blue-200"
            />
          )}

          {/* Other */}
          {other.length > 0 && (
            <ResultSection
              title="Other Emails (no clear signal)"
              icon={<MessageSquare className="h-5 w-5 text-gray-500" />}
              results={other}
              colorClass="border-gray-200"
            />
          )}
        </>
      )}

      {!scanning && results !== null && results.length === 0 && (
        <div className="island-shell rounded-xl p-8 text-center text-[var(--sea-ink-soft)]">
          No emails found matching your companies. This could mean no responses yet,
          or the company names in your spreadsheet don't match the email sender names.
        </div>
      )}

      {/* Setup link */}
      {!configured && (
        <section className="island-shell rounded-2xl p-6 text-center">
          <p className="mb-3 text-sm text-[var(--sea-ink-soft)]">
            Google API credentials are not configured yet.
          </p>
          <Link
            to="/setup"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--lagoon)] px-6 py-2.5 text-sm font-medium text-white no-underline transition hover:opacity-90"
          >
            View Setup Guide
          </Link>
        </section>
      )}
    </main>
  )
}

function ResultSection({
  title,
  icon,
  results,
  colorClass,
}: {
  title: string
  icon: React.ReactNode
  results: ScanResult[]
  colorClass: string
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        {icon} {title} ({results.length})
      </h2>
      <div className="space-y-2">
        {results.map((r) => (
          <CompanyEmailResult key={r.company} result={r} colorClass={colorClass} />
        ))}
      </div>
    </section>
  )
}

function CompanyEmailResult({
  result,
  colorClass,
}: {
  result: ScanResult
  colorClass: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`island-shell rounded-xl border ${colorClass} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div>
          <span className="font-semibold text-[var(--sea-ink)]">{result.company}</span>
          <span className="ml-2 text-xs text-[var(--sea-ink-soft)]">
            {result.emails.length} email{result.emails.length !== 1 ? 's' : ''}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[var(--sea-ink-soft)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--line)] p-4 pt-3">
          {result.emails.map((email) => (
            <EmailDetail key={email.messageId} email={email} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmailDetail({ email }: { email: ScannedEmail }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-sm font-medium text-[var(--sea-ink)]">{email.subject}</div>
      <div className="text-xs text-[var(--sea-ink-soft)]">
        From: {email.from} &middot; {email.date}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-[var(--sea-ink-soft)] opacity-60">
        ID: {email.messageId}
      </div>
      <div className="mt-1 text-xs text-[var(--sea-ink-soft)] opacity-80">{email.snippet}</div>
      {email.matchedKeywords.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {email.matchedKeywords.map((kw) => (
            <span
              key={kw}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                email.classification === 'rejection'
                  ? 'bg-red-100 text-red-700'
                  : email.classification === 'applied'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
              }`}
            >
              "{kw}"
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
