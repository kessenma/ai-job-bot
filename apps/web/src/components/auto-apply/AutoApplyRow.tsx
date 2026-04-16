import { useState } from 'react'
import { ArrowSquareOut, Robot, CircleNotch, CheckCircle, XCircle } from '@phosphor-icons/react'
import type { JobLead } from '#/lib/types.ts'
import { queueDryRun, type QueueItem } from '#/lib/queue.api.ts'

export function AutoApplyRow({ job }: { job: JobLead }) {
  const [loading, setLoading] = useState(false)
  const [queued, setQueued] = useState<QueueItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDryRun = async () => {
    if (!job.jobUrl) return
    setLoading(true)
    setError(null)
    setQueued(null)
    try {
      const result = await queueDryRun({ data: { jobUrl: job.jobUrl, company: job.company, role: job.role } })
      setQueued(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry run failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="island-shell rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--sea-ink)]">{job.company}</span>
            <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
              {job.atsPlatform}
            </span>
            {job.suitabilityScore != null && (
              <span className="rounded-full bg-[var(--surface-strong)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--sea-ink-soft)]">
                {job.suitabilityScore}/10
              </span>
            )}
          </div>
          <div className="text-sm text-[var(--sea-ink-soft)]">{job.role}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--sea-ink-soft)]">{job.activityStatus}</span>
          <button
            onClick={handleDryRun}
            disabled={loading || !!queued}
            className="flex items-center gap-1 rounded-full bg-[var(--lagoon)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <CircleNotch className="h-3 w-3 animate-spin" />
            ) : (
              <Robot className="h-3 w-3" />
            )}
            {loading ? 'Running...' : queued ? 'Queued' : 'Dry Run'}
          </button>
          <a
            href={job.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--lagoon-deep)] no-underline hover:bg-[var(--surface-strong)]"
          >
            <ArrowSquareOut className="h-3 w-3" />
            View
          </a>
        </div>
      </div>

      {/* Result display */}
      {(queued || error) && (
        <div className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {queued && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium">Queued for review</span>
              <span className="text-xs text-[var(--sea-ink-soft)]">
                {JSON.parse(queued.filledFields || '[]').length} fields filled
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
