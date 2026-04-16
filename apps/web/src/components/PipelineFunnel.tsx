import { Link } from '@tanstack/react-router'
import { ArrowRight } from '@phosphor-icons/react'
import { computeJobStats, getFollowUpCandidates } from '#/lib/job-filters.ts'
import type { JobLead, JobDescription } from '#/lib/types.ts'

interface PipelineFunnelProps {
  jobs: JobLead[]
  descMap: Record<string, JobDescription>
}

const stages = [
  { key: 'imported', label: 'Imported', to: '/pipeline' as const, color: 'bg-blue-500/10 text-blue-700 border-blue-200' },
  { key: 'descriptions', label: 'Descriptions', to: '/pipeline' as const, color: 'bg-indigo-500/10 text-indigo-700 border-indigo-200' },
  { key: 'ready', label: 'Ready', to: '/auto-apply' as const, color: 'bg-teal-500/10 text-teal-700 border-teal-200' },
  { key: 'applied', label: 'Applied', to: '/dashboard' as const, color: 'bg-green-500/10 text-green-700 border-green-200' },
  { key: 'followup', label: 'Follow Up', to: '/auto-apply' as const, color: 'bg-purple-500/10 text-purple-700 border-purple-200' },
] as const

export function PipelineFunnel({ jobs, descMap }: PipelineFunnelProps) {
  const stats = computeJobStats(jobs)
  const jobsWithDesc = jobs.filter((j) => j.jobUrl && descMap[j.jobUrl]).length
  const followUpCount = getFollowUpCandidates(jobs).length

  const counts: Record<string, number> = {
    imported: jobs.length,
    descriptions: jobsWithDesc,
    ready: stats.needsAction,
    applied: stats.submitted,
    followup: followUpCount,
  }

  return (
    <div className="island-shell mb-6 flex items-center gap-1 overflow-x-auto rounded-2xl p-4">
      {stages.map((stage, i) => (
        <div key={stage.key} className="flex items-center gap-1">
          <Link
            to={stage.to}
            className={`flex flex-col items-center rounded-xl border px-4 py-2 transition hover:shadow-sm ${stage.color}`}
          >
            <span className="text-xl font-bold">{counts[stage.key]}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{stage.label}</span>
          </Link>
          {i < stages.length - 1 && (
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--sea-ink-soft)] opacity-40" />
          )}
        </div>
      ))}
    </div>
  )
}
