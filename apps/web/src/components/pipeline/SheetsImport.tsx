import { useState, useCallback } from 'react'
import {
  Table as TableIcon, ArrowsClockwise, CircleNotch, CheckCircle, ArrowSquareOut, MagnifyingGlass, Shield, DownloadSimple,
} from '@phosphor-icons/react'
import { getJobs } from '#/lib/jobs.api.ts'
import { getSheetDebug, importFromSheet } from '#/lib/sheets.api.ts'
import { probeUrls } from '#/lib/playwright.api.ts'
import { PROBE_BADGE_STYLES } from '#/lib/color-maps.ts'
import type { JobLead, ProbeResult, ProbeStatus } from '#/lib/types.ts'
import { StatCard, StatusBadge, ErrorAlert } from '#/components/ui/index.ts'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table.tsx'
import { MobileSheetsCards } from '#/components/MobileSheetsCards.tsx'
import { useIsMobile } from '#/hooks/use-mobile.ts'

interface SheetsImportProps {
  initialJobs: JobLead[]
  sheetsStatus: { configured: boolean; authenticated: boolean; sheetUrl: string | null }
}

export function SheetsImport({ initialJobs, sheetsStatus }: SheetsImportProps) {
  const [jobs, setJobs] = useState(initialJobs)
  const [refreshing, setRefreshing] = useState(false)
  const [probeResults, setProbeResults] = useState<Map<string, ProbeResult>>(new Map())
  const [probing, setProbing] = useState(false)
  const [debug, setDebug] = useState<{
    headers: string[]
    sampleRows: string[][]
    mappedFields: string[]
  } | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; updated: number } | null>(null)
  const isMobile = useIsMobile()

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

  const handleProbe = useCallback(async () => {
    const urls = [...new Set(jobs.map((j) => j.jobUrl).filter(Boolean))]
    if (urls.length === 0) return
    setProbing(true)
    setError(null)
    try {
      const { results } = await probeUrls({ data: { urls } })
      const map = new Map<string, ProbeResult>()
      for (const r of results) map.set(r.url, r)
      setProbeResults(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Probe failed')
    } finally {
      setProbing(false)
    }
  }, [jobs])

  const handleImport = useCallback(async () => {
    setImporting(true)
    setError(null)
    setImportResult(null)
    try {
      const result = await importFromSheet()
      setImportResult(result)
      // Refresh job list after import
      const freshJobs = await getJobs()
      setJobs(freshJobs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }, [])

  const companies = [...new Set(jobs.map((j) => j.company).filter(Boolean))]

  return (
    <div>
      {/* Active sheet banner */}
      {sheetsStatus.configured && sheetsStatus.sheetUrl && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--lagoon)]/20 bg-[var(--lagoon)]/5 px-4 py-2.5">
          <TableIcon className="h-4 w-4 shrink-0 text-[var(--lagoon)]" />
          <span className="text-sm font-medium text-[var(--sea-ink)]">Active sheet:</span>
          <a
            href={sheetsStatus.sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-[var(--lagoon-deep)] hover:underline"
          >
            {sheetsStatus.sheetUrl} <ArrowSquareOut className="mb-0.5 inline h-3 w-3" />
          </a>
        </div>
      )}

      {/* Status + Actions */}
      <div className="island-shell mb-6 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TableIcon className="h-5 w-5 text-[var(--lagoon)]" />
            <div>
              <div className="font-semibold text-[var(--sea-ink)]">Sheet Connection</div>
              <div className="text-sm text-[var(--sea-ink-soft)]">
                {!sheetsStatus.configured ? (
                  'No Google Sheet configured. Set it up in Settings.'
                ) : !sheetsStatus.authenticated ? (
                  'Sheet URL set but not authenticated with Google.'
                ) : (
                  <>
                    Connected — import recruiter leads from{' '}
                    <a
                      href={sheetsStatus.sheetUrl ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--lagoon-deep)]"
                    >
                      your sheet <ArrowSquareOut className="mb-0.5 inline h-3 w-3" />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
          {sheetsStatus.configured && sheetsStatus.authenticated && (
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-1.5 rounded-full border border-[var(--lagoon)] px-4 py-2 text-sm font-medium text-[var(--lagoon)] transition hover:bg-[var(--lagoon)]/5 disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <CircleNotch className="h-3.5 w-3.5 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <DownloadSimple className="h-3.5 w-3.5" />
                    Import from Sheet
                  </>
                )}
              </button>
              <button
                onClick={handleProbe}
                disabled={probing || jobs.filter((j) => j.jobUrl).length === 0}
                className="flex items-center gap-1.5 rounded-full border border-[var(--lagoon)] px-4 py-2 text-sm font-medium text-[var(--lagoon)] transition hover:bg-[var(--lagoon)]/5 disabled:opacity-50"
              >
                {probing ? (
                  <>
                    <CircleNotch className="h-3.5 w-3.5 animate-spin" />
                    Probing {jobs.filter((j) => j.jobUrl).length} URLs…
                  </>
                ) : (
                  <>
                    <MagnifyingGlass className="h-3.5 w-3.5" />
                    Probe URLs
                  </>
                )}
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {refreshing ? (
                  <CircleNotch className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowsClockwise className="h-3.5 w-3.5" />
                )}
                Refresh
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4"><ErrorAlert message={error} /></div>
      )}

      {importResult && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0" weight="fill" />
          Imported {importResult.imported} job{importResult.imported !== 1 ? 's' : ''}
          {importResult.skipped > 0 && ` (${importResult.skipped} skipped as duplicates)`}
        </div>
      )}

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Jobs" value={jobs.length} />
        <StatCard label="Companies" value={companies.length} />
        <StatCard label="With Job URL" value={jobs.filter((j) => j.jobUrl).length} />
        <StatCard label="With Recruiter Email" value={jobs.filter((j) => j.recruiterEmail && j.recruiterEmail !== 'N/A').length} />
      </div>

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

      {/* Jobs table / mobile cards */}
      {jobs.length > 0 && (
        isMobile ? (
          <MobileSheetsCards jobs={jobs} probeResults={probeResults} />
        ) : (
          <div className="island-shell overflow-hidden rounded-2xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>ATS</TableHead>
                  <TableHead>Probe</TableHead>
                  <TableHead>Captcha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-[var(--sea-ink)]">
                      {job.company || '—'}
                    </TableCell>
                    <TableCell className="text-[var(--sea-ink)]">
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
                    </TableCell>
                    <TableCell className="text-[var(--sea-ink-soft)]">{job.location || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={job.applicationStatus} />
                    </TableCell>
                    <TableCell className="text-xs text-[var(--sea-ink-soft)]">{job.atsPlatform}</TableCell>
                    <TableCell>
                      {job.jobUrl && probeResults.has(job.jobUrl) ? (
                        <ProbeStatusBadge status={probeResults.get(job.jobUrl)!.status} />
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {job.jobUrl && probeResults.has(job.jobUrl) ? (
                        probeResults.get(job.jobUrl)!.hasCaptcha ? (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Shield className="h-3 w-3" /> Yes
                          </span>
                        ) : (
                          <span className="text-green-600">No</span>
                        )
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {jobs.length === 0 && sheetsStatus.configured && (
        <div className="island-shell rounded-xl p-8 text-center text-[var(--sea-ink-soft)]">
          No jobs loaded. Check the column mapping debug above or verify your sheet has data.
        </div>
      )}
    </div>
  )
}

function ProbeStatusBadge({ status }: { status: ProbeStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PROBE_BADGE_STYLES[status]}`}>
      {status}
    </span>
  )
}
