import { motion } from 'motion/react'
import {
  ArrowSquareOut, Shield,
} from '@phosphor-icons/react'
import { StatusBadge } from '#/components/ui/index.ts'
import { PROBE_BADGE_STYLES } from '#/lib/color-maps.ts'
import type { JobLead } from '#/lib/types.ts'
import type { ProbeResult } from '#/lib/types.ts'

interface MobileSheetsCardsProps {
  jobs: JobLead[]
  probeResults: Map<string, ProbeResult>
}

export function MobileSheetsCards({ jobs, probeResults }: MobileSheetsCardsProps) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center text-[var(--sea-ink-soft)]">
        No jobs loaded.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {jobs.map((job, i) => {
        const probe = job.jobUrl ? probeResults.get(job.jobUrl) : undefined

        return (
          <motion.div
            key={`${job.jobUrl}-${i}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.4) }}
          >
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              {/* Header: Company + Status */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--sea-ink)]">{job.company || '—'}</div>
                  <div className="mt-0.5 text-sm text-[var(--sea-ink)]">
                    {job.jobUrl ? (
                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--lagoon-deep)] hover:underline"
                      >
                        {job.role || 'View'} <ArrowSquareOut className="h-3 w-3" />
                      </a>
                    ) : (
                      job.role || '—'
                    )}
                  </div>
                </div>
                <StatusBadge status={job.applicationStatus} />
              </div>

              {/* Details */}
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sea-ink-soft)]">
                {job.location && <span>{job.location}</span>}
                <span>ATS: {job.atsPlatform}</span>
              </div>

              {/* Probe results */}
              {probe && (
                <div className="flex items-center gap-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PROBE_BADGE_STYLES[probe.status]}`}>
                    {probe.status}
                  </span>
                  {probe.hasCaptcha ? (
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <Shield className="h-3 w-3" /> Captcha
                    </span>
                  ) : (
                    <span className="text-xs text-green-600">No captcha</span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
