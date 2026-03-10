import { useState, useCallback } from 'react'
import {
  MagnifyingGlass, Link as LinkIcon, LinkBreak, CheckCircle, XCircle,
  ChatCenteredDots, CircleNotch, CaretDown, CaretUp, EnvelopeSimple,
} from '@phosphor-icons/react'
import { scanOneCompany, disconnectGmailAccount } from '#/lib/gmail.api.ts'
import type { ScanResult, ScannedEmail } from '#/lib/gmail.server.ts'
import type { JobLead } from '#/lib/types.ts'
import { ProgressBar, StatCard, ErrorAlert } from '#/components/ui/index.ts'

interface EmailScannerProps {
  jobs: JobLead[]
  gmailStatus: { configured: boolean; connected: boolean; authUrl: string | null }
  savedEmails: ScanResult[]
}

export function EmailScanner({ jobs, gmailStatus, savedEmails }: EmailScannerProps) {
  const [connected, setConnected] = useState(gmailStatus.connected)
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

  const allResults = results ?? []
  const rejections = allResults.filter((r) => r.suggestedStatus === 'rejection')
  const interviews = allResults.filter((r) => r.suggestedStatus === 'interview')
  const applied = allResults.filter((r) => r.suggestedStatus === 'applied')
  const other = allResults.filter((r) => r.suggestedStatus === null)
  const totalEmails = allResults.reduce((sum, r) => sum + r.emails.length, 0)

  return (
    <div>
      {/* Connection status */}
      <div className="island-shell mb-6 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EnvelopeSimple className="h-5 w-5 text-[var(--lagoon)]" />
            <div>
              <div className="font-semibold text-[var(--sea-ink)]">Gmail Connection</div>
              <div className="text-sm text-[var(--sea-ink-soft)]">
                {!gmailStatus.configured
                  ? 'Google API credentials not configured. Complete the setup guide above.'
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
              <LinkBreak className="h-3.5 w-3.5" />
              Disconnect
            </button>
          ) : gmailStatus.configured ? (
            <a
              href={gmailStatus.authUrl ?? '#'}
              className="flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white no-underline transition hover:opacity-90"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              Connect Gmail
            </a>
          ) : null}
        </div>
      </div>

      {/* Scan controls */}
      {connected && (
        <div className="mb-6">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-full bg-[var(--lagoon)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {scanning ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <MagnifyingGlass className="h-4 w-4" />
            )}
            {scanning ? 'Scanning emails...' : `Scan Emails (${companies.length} companies)`}
          </button>

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
        </div>
      )}

      {/* Results */}
      {allResults.length > 0 && (
        <>
          <div className="mb-4 rounded-lg bg-[var(--surface)] px-4 py-2 text-xs text-[var(--sea-ink-soft)]">
            {scanning
              ? `Scanning... ${totalEmails} emails found so far across ${allResults.length} companies`
              : lastScanWasLive
                ? `Live scan results — ${totalEmails} emails across ${allResults.length} companies (saved to database)`
                : `Showing ${totalEmails} previously scanned emails across ${allResults.length} companies`}
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Rejections" value={rejections.length} colorClass="bg-red-500/10 text-red-700" />
            <StatCard label="Interviews" value={interviews.length} colorClass="bg-purple-500/10 text-purple-700" />
            <StatCard label="Applied" value={applied.length} colorClass="bg-blue-500/10 text-blue-700" />
            <StatCard label="Other" value={other.length} colorClass="bg-gray-500/10 text-gray-600" />
          </div>

          {rejections.length > 0 && (
            <ResultSection title="Rejections" icon={<XCircle className="h-5 w-5 text-red-600" />} results={rejections} colorClass="border-red-200" />
          )}
          {interviews.length > 0 && (
            <ResultSection title="Interview / Positive Signals" icon={<CheckCircle className="h-5 w-5 text-purple-600" />} results={interviews} colorClass="border-purple-200" />
          )}
          {applied.length > 0 && (
            <ResultSection title="Applied / Acknowledgments" icon={<EnvelopeSimple className="h-5 w-5 text-blue-600" />} results={applied} colorClass="border-blue-200" />
          )}
          {other.length > 0 && (
            <ResultSection title="Other Emails (no clear signal)" icon={<ChatCenteredDots className="h-5 w-5 text-gray-500" />} results={other} colorClass="border-gray-200" />
          )}
        </>
      )}

      {!scanning && results !== null && results.length === 0 && (
        <div className="island-shell rounded-xl p-8 text-center text-[var(--sea-ink-soft)]">
          No emails found matching your companies. This could mean no responses yet,
          or the company names in your spreadsheet don't match the email sender names.
        </div>
      )}
    </div>
  )
}

function ResultSection({ title, icon, results, colorClass }: {
  title: string; icon: React.ReactNode; results: ScanResult[]; colorClass: string
}) {
  return (
    <div className="mb-6">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
        {icon} {title} ({results.length})
      </h3>
      <div className="space-y-2">
        {results.map((r) => (
          <CompanyEmailResult key={r.company} result={r} colorClass={colorClass} />
        ))}
      </div>
    </div>
  )
}

function CompanyEmailResult({ result, colorClass }: { result: ScanResult; colorClass: string }) {
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
          <CaretUp className="h-4 w-4 text-[var(--sea-ink-soft)]" />
        ) : (
          <CaretDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />
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
