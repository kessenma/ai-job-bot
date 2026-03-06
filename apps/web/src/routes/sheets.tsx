import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import {
  Table, RefreshCw, Loader2, CheckCircle, ExternalLink,
} from 'lucide-react'
import { getJobs } from '#/lib/jobs.api.ts'
import { getSheetsStatus, getSheetDebug } from '#/lib/sheets.api.ts'
import type { JobLead } from '#/lib/types.ts'
import { StatCard, StatusBadge, ErrorAlert } from '#/components/ui/index.ts'
import { requireAuth } from '#/lib/auth-guard.ts'

export const Route = createFileRoute('/sheets')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [jobs, sheetsStatus] = await Promise.all([
      getJobs(),
      getSheetsStatus(),
    ])
    return { jobs, sheetsStatus }
  },
  component: Sheets,
})

function Sheets() {
  const { jobs: initialJobs, sheetsStatus } = Route.useLoaderData()
  const [jobs, setJobs] = useState(initialJobs)
  const [refreshing, setRefreshing] = useState(false)
  const [debug, setDebug] = useState<{
    headers: string[]
    sampleRows: string[][]
    mappedFields: string[]
  } | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const freshJobs = await getJobs()
      setJobs(freshJobs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh')
    } finally {
      setRefreshing(false)
    }
  }, [])

  const handleDebug = useCallback(async () => {
    if (debug) {
      setShowDebug(!showDebug)
      return
    }
    try {
      const data = await getSheetDebug()
      setDebug(data)
      setShowDebug(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load debug data')
    }
  }, [debug, showDebug])

  const companies = [...new Set(jobs.map((j) => j.company).filter(Boolean))]

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <Table className="h-6 w-6 text-[var(--lagoon)]" />
        Google Sheets
      </h1>
      <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
        View and manage your job data from Google Sheets.
      </p>

      {/* Active sheet banner */}
      {sheetsStatus.configured && sheetsStatus.sheetUrl && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--lagoon)]/20 bg-[var(--lagoon)]/5 px-4 py-2.5">
          <Table className="h-4 w-4 shrink-0 text-[var(--lagoon)]" />
          <span className="text-sm font-medium text-[var(--sea-ink)]">Active sheet:</span>
          <a
            href={sheetsStatus.sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-[var(--lagoon-deep)] hover:underline"
          >
            {sheetsStatus.sheetUrl} <ExternalLink className="mb-0.5 inline h-3 w-3" />
          </a>
        </div>
      )}

      {/* Status */}
      <section className="island-shell mb-6 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Table className="h-5 w-5 text-[var(--lagoon)]" />
            <div>
              <div className="font-semibold text-[var(--sea-ink)]">Sheet Connection</div>
              <div className="text-sm text-[var(--sea-ink-soft)]">
                {!sheetsStatus.configured ? (
                  'No Google Sheet configured.'
                ) : !sheetsStatus.authenticated ? (
                  'Sheet URL set but not authenticated with Google.'
                ) : (
                  <>
                    Connected — reading from{' '}
                    <a
                      href={sheetsStatus.sheetUrl ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--lagoon-deep)]"
                    >
                      your sheet <ExternalLink className="mb-0.5 inline h-3 w-3" />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
          {sheetsStatus.configured && sheetsStatus.authenticated && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
          )}
        </div>

        {!sheetsStatus.configured && (
          <Link
            to="/setup"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white no-underline transition hover:opacity-90"
          >
            Configure in Setup
          </Link>
        )}
      </section>

      {error && (
        <div className="mb-4"><ErrorAlert message={error} /></div>
      )}

      {/* Summary stats */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Jobs" value={jobs.length} />
        <StatCard label="Companies" value={companies.length} />
        <StatCard label="With Job URL" value={jobs.filter((j) => j.jobUrl).length} />
        <StatCard label="With Recruiter Email" value={jobs.filter((j) => j.recruiterEmail && j.recruiterEmail !== 'N/A').length} />
      </section>

      {/* Debug section */}
      {sheetsStatus.configured && sheetsStatus.authenticated && (
        <div className="mb-6">
          <button
            onClick={handleDebug}
            className="text-xs font-medium text-[var(--sea-ink-soft)] underline transition hover:text-[var(--sea-ink)]"
          >
            {showDebug ? 'Hide' : 'Show'} column mapping debug
          </button>

          {showDebug && debug && (
            <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="mb-3">
                <div className="mb-1 text-xs font-semibold text-[var(--sea-ink)]">
                  Sheet Headers ({debug.headers.length} columns):
                </div>
                <div className="flex flex-wrap gap-1">
                  {debug.headers.map((h, i) => (
                    <span key={i} className="rounded bg-[var(--surface-strong)] px-2 py-0.5 text-xs text-[var(--sea-ink)]">
                      [{i}] {h}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <div className="mb-1 text-xs font-semibold text-[var(--sea-ink)]">
                  Mapped Fields ({debug.mappedFields.length}):
                </div>
                {debug.mappedFields.map((f, i) => (
                  <div key={i} className="flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle className="h-3 w-3" /> {f}
                  </div>
                ))}
                {debug.mappedFields.length === 0 && (
                  <div className="text-xs text-red-600">No columns could be mapped!</div>
                )}
              </div>
              {debug.sampleRows.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-[var(--sea-ink)]">
                    First row sample:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {debug.sampleRows[0]!.map((cell, i) => (
                      <span key={i} className="rounded bg-[var(--surface-strong)] px-2 py-0.5 text-xs text-[var(--sea-ink)]">
                        [{i}] {cell || '(empty)'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Jobs table */}
      {jobs.length > 0 && (
        <section className="island-shell overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface)]">
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--sea-ink-soft)]">Company</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--sea-ink-soft)]">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--sea-ink-soft)]">Location</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--sea-ink-soft)]">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[var(--sea-ink-soft)]">ATS</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, i) => (
                  <tr key={i} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--sea-ink)]">
                      {job.company || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--sea-ink)]">
                      {job.jobUrl ? (
                        <a
                          href={job.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--lagoon-deep)] hover:underline"
                        >
                          {job.role || 'View'}
                        </a>
                      ) : (
                        job.role || '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--sea-ink-soft)]">{job.location || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.applicationStatus} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--sea-ink-soft)]">{job.atsPlatform}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {jobs.length === 0 && sheetsStatus.configured && (
        <div className="island-shell rounded-xl p-8 text-center text-[var(--sea-ink-soft)]">
          No jobs loaded. Check the column mapping debug above or verify your sheet has data.
        </div>
      )}
    </main>
  )
}

