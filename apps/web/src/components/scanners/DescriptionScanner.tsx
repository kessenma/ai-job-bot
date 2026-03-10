import { useState, useEffect } from 'react'
import {
  FileText, CircleNotch, MagnifyingGlass, CheckCircle, XCircle, Warning,
  CaretDown, CaretUp, ArrowSquareOut, ArrowsClockwise,
} from '@phosphor-icons/react'
import { useScanContext, type ScrapeFailure } from '#/hooks/useScanContext.tsx'
import type { JobLead, JobDescription } from '#/lib/types.ts'
import { ProgressBar, StatCard } from '#/components/ui/index.ts'

interface DescriptionScannerProps {
  jobs: JobLead[]
  existingDescriptions: Record<string, JobDescription>
  onDescriptionsChange: (updated: Record<string, JobDescription>) => void
}

export function DescriptionScanner({ jobs, existingDescriptions, onDescriptionsChange }: DescriptionScannerProps) {
  const { descScan, startDescScan, cancelDescScan, initDescMap } = useScanContext()

  // Seed the global context with loader data on mount
  useEffect(() => {
    initDescMap(existingDescriptions)
  }, [existingDescriptions, initDescMap])

  // Sync descMap changes back to parent (setup page)
  useEffect(() => {
    if (descScan.initialized) {
      onDescriptionsChange(descScan.descMap)
    }
  }, [descScan.descMap, descScan.initialized, onDescriptionsChange])

  const { active: scanning, progress, results, descMap } = descScan

  const jobsWithUrls = jobs.filter((j) => j.jobUrl)
  const needsScraping = jobsWithUrls.filter((j) => !descMap[j.jobUrl])
  const alreadyScraped = jobsWithUrls.filter((j) => descMap[j.jobUrl])

  return (
    <div>
      {/* Summary */}
      <div className="island-shell mb-6 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[var(--lagoon)]" />
            <div>
              <div className="font-semibold text-[var(--sea-ink)]">Job Descriptions</div>
              <div className="text-sm text-[var(--sea-ink-soft)]">
                {alreadyScraped.length} of {jobsWithUrls.length} jobs have descriptions scraped.
                {needsScraping.length > 0 && ` ${needsScraping.length} remaining.`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scan controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => startDescScan(jobs, 'missing')}
          disabled={scanning || needsScraping.length === 0}
          className="flex items-center gap-2 rounded-full bg-[var(--lagoon)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {scanning ? (
            <CircleNotch className="h-4 w-4 animate-spin" />
          ) : (
            <MagnifyingGlass className="h-4 w-4" />
          )}
          {scanning
            ? 'Scraping descriptions...'
            : needsScraping.length === 0
              ? 'All descriptions scraped'
              : `Scrape Missing (${needsScraping.length})`}
        </button>

        <button
          onClick={() => startDescScan(jobs, 'all')}
          disabled={scanning || jobsWithUrls.length === 0}
          className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[var(--sea-ink)] transition hover:bg-[var(--surface-strong)] disabled:opacity-50"
        >
          <ArrowsClockwise className="h-4 w-4" />
          Re-scrape All ({jobsWithUrls.length})
        </button>

        {scanning && (
          <button
            onClick={cancelDescScan}
            className="rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      {scanning && (
        <div className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <ProgressBar
            current={progress.current}
            total={progress.total}
            label={progress.currentJob
              ? `Scraping: ${progress.currentJob}`
              : 'Starting scan...'}
          />
        </div>
      )}

      {/* Results */}
      {results && !scanning && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Scraped" value={results.successes.length} colorClass="bg-green-500/10 text-green-700" />
            <StatCard label="Failed" value={results.failures.length} colorClass="bg-red-500/10 text-red-700" />
            <StatCard label="Already Had" value={alreadyScraped.length} colorClass="bg-blue-500/10 text-blue-700" />
          </div>

          {/* Failures */}
          {results.failures.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
                <Warning className="h-5 w-5 text-red-600" />
                Failed ({results.failures.length})
              </h3>
              <div className="space-y-2">
                {results.failures.map((failure) => (
                  <FailureCard key={failure.jobUrl} failure={failure} />
                ))}
              </div>
            </div>
          )}

          {/* Successes */}
          {results.successes.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Scraped ({results.successes.length})
              </h3>
              <div className="space-y-1">
                {results.successes.map((s) => (
                  <div key={s.jobUrl} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[var(--sea-ink)]">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
                    <span className="font-medium">{s.company}</span>
                    <span className="text-[var(--sea-ink-soft)]">— {s.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Live results during scan */}
      {results && scanning && (results.successes.length > 0 || results.failures.length > 0) && (
        <div className="mb-4 rounded-lg bg-[var(--surface)] px-4 py-2 text-xs text-[var(--sea-ink-soft)]">
          Scanning... {results.successes.length} scraped, {results.failures.length} failed so far
        </div>
      )}
    </div>
  )
}

function FailureCard({ failure }: { failure: ScrapeFailure }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="island-shell rounded-xl border border-red-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="font-semibold text-[var(--sea-ink)]">{failure.company}</span>
          </div>
          <div className="mt-0.5 text-xs text-[var(--sea-ink-soft)] truncate">{failure.role}</div>
        </div>
        <div className="flex items-center gap-2">
          {failure.screenshot && (
            <span className="text-[10px] font-medium text-[var(--sea-ink-soft)]">has screenshot</span>
          )}
          {expanded ? (
            <CaretUp className="h-4 w-4 text-[var(--sea-ink-soft)]" />
          ) : (
            <CaretDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--line)] p-4 space-y-3">
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            {failure.error}
          </div>

          <a
            href={failure.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--lagoon-deep)] no-underline hover:underline"
          >
            <ArrowSquareOut className="h-3 w-3" />
            {failure.jobUrl}
          </a>

          {failure.screenshot && (
            <div className="overflow-hidden rounded-lg border border-[var(--line)]">
              <img
                src={`data:image/png;base64,${failure.screenshot}`}
                alt={`Screenshot of ${failure.company} job page`}
                className="w-full"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
