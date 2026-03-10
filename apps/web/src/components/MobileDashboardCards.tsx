import { motion } from 'motion/react'
import {
  MapPinIcon, ArrowSquareOutIcon, CheckCircle,
} from '@phosphor-icons/react'
import { ATS_DIFFICULTY } from '#/lib/ats-classifier.ts'
import type { JobLead } from '#/lib/types.ts'
import type { CoverLetterMap } from '#/components/DashboardJobSheet.tsx'

const statusColors: Record<string, string> = {
  submitted: 'bg-blue-500/15 text-blue-700',
  applied: 'bg-blue-500/15 text-blue-700',
  rejected: 'bg-red-500/15 text-red-700',
  interview: 'bg-purple-500/15 text-purple-700',
  'action needed': 'bg-orange-500/15 text-orange-700',
  'not submitted': 'bg-gray-500/15 text-gray-600',
  expired: 'bg-gray-500/15 text-gray-600',
}

const diffColors: Record<string, string> = {
  easy: 'bg-green-500/15 text-green-700',
  medium: 'bg-yellow-500/15 text-yellow-700',
  hard: 'bg-red-500/15 text-red-700',
}

interface MobileDashboardCardsProps {
  jobs: JobLead[]
  clMap: CoverLetterMap
  onSelectJob: (job: JobLead) => void
}

export function MobileDashboardCards({ jobs, clMap, onSelectJob }: MobileDashboardCardsProps) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center text-[var(--sea-ink-soft)]">
        No jobs match this filter.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {jobs.map((job, i) => {
        const difficulty = ATS_DIFFICULTY[job.atsPlatform]
        const statusKey = Object.keys(statusColors).find((k) =>
          job.applicationStatus.toLowerCase().includes(k),
        )
        const cl = clMap[job.jobUrl]

        return (
          <motion.div
            key={job.jobUrl}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.4) }}
          >
            <button
              type="button"
              onClick={() => onSelectJob(job)}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition-shadow hover:shadow-md active:scale-[0.99]"
            >
              {/* Header: Company + Status */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[var(--sea-ink)]">{job.company}</div>
                  <div className="mt-0.5 truncate text-sm text-[var(--sea-ink-soft)]" title={job.role}>
                    {job.role}
                  </div>
                </div>
                {statusKey && (
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[statusKey]}`}>
                    {job.applicationStatus}
                  </span>
                )}
              </div>

              {/* Details row */}
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sea-ink-soft)]">
                {job.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="h-3 w-3" />
                    {job.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <ArrowSquareOutIcon className="h-3 w-3" />
                  {job.atsPlatform}
                </span>
              </div>

              {/* Footer: ATS difficulty + Cover Letter */}
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${diffColors[difficulty]}`}>
                  {difficulty}
                </span>
                {cl && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700">
                    <CheckCircle className="h-3 w-3" /> Cover Letter
                  </span>
                )}
              </div>
            </button>
          </motion.div>
        )
      })}
    </div>
  )
}
