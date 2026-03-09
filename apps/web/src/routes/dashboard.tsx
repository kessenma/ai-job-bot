import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  BriefcaseIcon, PaperPlaneTiltIcon, ChatCenteredDotsIcon, XCircleIcon, WarningIcon, LightningIcon,
  CheckCircle,
} from '@phosphor-icons/react'
import {
  getJobs,
  getJobCoverLetters,
} from '#/lib/jobs.api.ts'
import { getCoverLetters } from '#/lib/resume.api.ts'
import { getSavedEmails } from '#/lib/gmail.api.ts'
import { ATS_DIFFICULTY } from '#/lib/ats-classifier.ts'
import type { ATSPlatform, JobLead } from '#/lib/types.ts'
import type { ScannedEmail } from '#/lib/gmail.server.ts'
import { requireAuth } from '#/lib/auth-guard.ts'
import { DashboardJobSheet, type CoverLetterMap } from '#/components/DashboardJobSheet.tsx'
import { DashboardSkeleton } from '#/components/examples/skeleton/table/skeleton-table-2.tsx'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [jobs, savedEmails, jobCoverLetters, coverLetterSamples] = await Promise.all([
      getJobs(),
      getSavedEmails(),
      getJobCoverLetters(),
      getCoverLetters(),
    ])
    return { jobs, savedEmails, jobCoverLetters, coverLetterSamples }
  },
  pendingComponent: DashboardSkeleton,
  component: Dashboard,
})

type FilterTab = 'all' | 'ready' | 'applied' | 'followup' | 'rejected' | 'expired'

const statusColors: Record<string, string> = {
  submitted: 'bg-blue-500/15 text-blue-700',
  applied: 'bg-blue-500/15 text-blue-700',
  rejected: 'bg-red-500/15 text-red-700',
  interview: 'bg-purple-500/15 text-purple-700',
  'action needed': 'bg-orange-500/15 text-orange-700',
  'not submitted': 'bg-gray-500/15 text-gray-600',
  expired: 'bg-gray-500/15 text-gray-600',
}

const diffColors = {
  easy: 'bg-green-500/15 text-green-700',
  medium: 'bg-yellow-500/15 text-yellow-700',
  hard: 'bg-red-500/15 text-red-700',
}


function Dashboard() {
  const { jobs, savedEmails, jobCoverLetters: initialCLMap, coverLetterSamples } = Route.useLoaderData()
  const [tab, setTab] = useState<FilterTab>('all')
  const [platformFilter, setPlatformFilter] = useState<ATSPlatform | 'all'>('all')
  const [selectedJob, setSelectedJob] = useState<JobLead | null>(null)
  const [clMap, setClMap] = useState<CoverLetterMap>(initialCLMap)

  const emailsByCompany = new Map<string, ScannedEmail[]>()
  for (const result of savedEmails) {
    emailsByCompany.set(result.company.trim().toLowerCase(), result.emails)
  }

  const filtered = jobs.filter((j) => {
    if (platformFilter !== 'all' && j.atsPlatform !== platformFilter) return false
    const status = j.applicationStatus.toLowerCase()
    const activity = j.activityStatus.toLowerCase()
    switch (tab) {
      case 'ready':
        return (
          activity.includes('candidate should apply') ||
          status.includes('action needed') ||
          (activity.includes('applied') === false &&
            !activity.includes('expired') &&
            !activity.includes('will not'))
        )
      case 'applied':
        return status.includes('submitted') || status.includes('applied')
      case 'followup':
        return (
          (status.includes('submitted') || status.includes('applied')) &&
          j.recruiterEmail &&
          j.recruiterEmail !== 'N/A' &&
          j.recruiterEmail !== 'Unavailable' &&
          !j.recruiterEmail.includes('Unavailable') &&
          !j.followUpEmailStatus?.toLowerCase().includes('sent')
        )
      case 'rejected':
        return status.includes('rejected')
      case 'expired':
        return activity.includes('expired') || status.includes('expired')
      default:
        return true
    }
  })

  const platforms = [...new Set(jobs.map((j) => j.atsPlatform))].sort()

  const stats = {
    total: jobs.length,
    submitted: jobs.filter((j) => j.applicationStatus.toLowerCase().includes('submitted')).length,
    interview: jobs.filter((j) => j.applicationStatus.toLowerCase().includes('interview')).length,
    rejected: jobs.filter((j) => j.applicationStatus.toLowerCase().includes('rejected')).length,
    needsAction: jobs.filter(
      (j) =>
        j.activityStatus.toLowerCase().includes('candidate should apply') ||
        j.applicationStatus.toLowerCase().includes('action needed'),
    ).length,
    canAutoApply: jobs.filter(
      (j) =>
        ATS_DIFFICULTY[j.atsPlatform] === 'easy' &&
        !j.activityStatus.toLowerCase().includes('expired') &&
        !j.applicationStatus.toLowerCase().includes('submitted') &&
        !j.applicationStatus.toLowerCase().includes('rejected') &&
        !j.activityStatus.toLowerCase().includes('will not'),
    ).length,
  }

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: jobs.length },
    { key: 'ready', label: 'Ready to Apply', count: stats.needsAction },
    { key: 'applied', label: 'Applied', count: stats.submitted },
    { key: 'followup', label: 'Needs Follow-up' },
    { key: 'rejected', label: 'Rejected', count: stats.rejected },
    { key: 'expired', label: 'Expired' },
  ]

  const selectedEmails = selectedJob
    ? (emailsByCompany.get(selectedJob.company.trim().toLowerCase()) ?? [])
    : []

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      {/* Stats */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" count={stats.total} cls="bg-blue-500/10 text-blue-700" icon={<BriefcaseIcon className="h-4 w-4 opacity-60" />} />
        <StatCard label="Submitted" count={stats.submitted} cls="bg-green-500/10 text-green-700" icon={<PaperPlaneTiltIcon className="h-4 w-4 opacity-60" />} />
        <StatCard label="Interviews" count={stats.interview} cls="bg-purple-500/10 text-purple-700" icon={<ChatCenteredDotsIcon className="h-4 w-4 opacity-60" />} />
        <StatCard label="Rejected" count={stats.rejected} cls="bg-red-500/10 text-red-700" icon={<XCircleIcon className="h-4 w-4 opacity-60" />} />
        <StatCard label="Needs Action" count={stats.needsAction} cls="bg-orange-500/10 text-orange-700" icon={<WarningIcon className="h-4 w-4 opacity-60" />} />
        <StatCard label="Auto-Apply Ready" count={stats.canAutoApply} cls="bg-teal-500/10 text-teal-700" icon={<LightningIcon className="h-4 w-4 opacity-60" />} />
      </section>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? 'bg-[var(--lagoon)] text-white'
                : 'bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 opacity-70">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Platform filter */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--sea-ink-soft)]">ATS:</span>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value as ATSPlatform | 'all')}
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-sm"
        >
          <option value="all">All Platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p} ({jobs.filter((j) => j.atsPlatform === p).length})
            </option>
          ))}
        </select>
      </div>

      {/* Job table */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-strong)]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">Company</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider hidden sm:table-cell">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">ATS</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider hidden md:table-cell">Cover Letter</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((job) => {
                const difficulty = ATS_DIFFICULTY[job.atsPlatform]
                const statusKey = Object.keys(statusColors).find((k) =>
                  job.applicationStatus.toLowerCase().includes(k),
                )
                const cl = clMap[job.jobUrl]
                return (
                  <tr
                    key={job.jobUrl}
                    className="border-b border-[var(--line)] cursor-pointer transition-colors hover:bg-[var(--surface-strong)]"
                    onClick={() => setSelectedJob(job)}
                  >
                    <td className="px-4 py-3 font-semibold text-[var(--sea-ink)]">{job.company}</td>
                    <td className="px-4 py-3 text-sm text-[var(--sea-ink-soft)] max-w-[200px] truncate" title={job.role}>{job.role}</td>
                    <td className="px-4 py-3 text-sm text-[var(--sea-ink-soft)] max-w-[150px] truncate hidden sm:table-cell" title={job.location}>{job.location || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[var(--surface)] text-[var(--sea-ink-soft)]">{job.atsPlatform}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${diffColors[difficulty]}`}>{difficulty}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {statusKey ? (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[statusKey]}`}>{job.applicationStatus}</span>
                      ) : (
                        <span className="text-sm text-[var(--sea-ink-soft)]">{job.applicationStatus}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {cl ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700">
                          <CheckCircle className="h-3 w-3" /> Attached
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--sea-ink-soft)]">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td className="h-24 text-center text-[var(--sea-ink-soft)]" colSpan={6}>
                  No jobs match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Job detail sheet */}
      <DashboardJobSheet
        selectedJob={selectedJob}
        onClose={() => setSelectedJob(null)}
        emails={selectedEmails}
        coverLetter={selectedJob ? clMap[selectedJob.jobUrl] : undefined}
        coverLetterSamples={coverLetterSamples}
        onCoverLetterChange={(jobUrl: string, cl: CoverLetterMap[string] | null) => {
          setClMap((prev) => {
            if (cl) return { ...prev, [jobUrl]: cl }
            const next = { ...prev }
            delete next[jobUrl]
            return next
          })
        }}
      />
    </main>
  )
}

function StatCard({ label, count, cls, icon }: { label: string; count: number; cls: string; icon: React.ReactNode }) {
  return (
    <div className={`rounded-xl p-4 ${cls}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-2xl font-bold">{count}</span>
        {icon}
      </div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  )
}

