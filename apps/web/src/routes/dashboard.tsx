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
import { getJobDescriptions } from '#/lib/playwright.api.ts'
import { ATS_DIFFICULTY } from '#/lib/ats-classifier.ts'
import { STATUS_COLORS, DIFFICULTY_COLORS, getStatusColorKey } from '#/lib/color-maps.ts'
import { filterJobsByTab, computeJobStats, type FilterTab } from '#/lib/job-filters.ts'
import type { ATSPlatform, JobLead } from '#/lib/types.ts'
import type { ScannedEmail } from '#/lib/gmail.server.ts'
import { requireAuth } from '#/lib/auth-guard.ts'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table.tsx'
import { PipelineFunnel } from '#/components/PipelineFunnel.tsx'
import { DashboardJobSheet, type CoverLetterMap, type JobDescriptionMap } from '#/components/DashboardJobSheet.tsx'
import { DashboardSkeleton } from '#/components/examples/skeleton/table/skeleton-table-2.tsx'
import { MobileDashboardCards } from '#/components/MobileDashboardCards.tsx'
import { useIsMobile } from '#/hooks/use-mobile.ts'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [jobs, savedEmails, jobCoverLetters, coverLetterSamples, jobDescriptions] = await Promise.all([
      getJobs(),
      getSavedEmails(),
      getJobCoverLetters(),
      getCoverLetters(),
      getJobDescriptions(),
    ])
    return { jobs, savedEmails, jobCoverLetters, coverLetterSamples, jobDescriptions }
  },
  pendingComponent: DashboardSkeleton,
  component: Dashboard,
})


function Dashboard() {
  const { jobs, savedEmails, jobCoverLetters: initialCLMap, coverLetterSamples, jobDescriptions: initialDescMap } = Route.useLoaderData()
  const [tab, setTab] = useState<FilterTab>('all')
  const [platformFilter, setPlatformFilter] = useState<ATSPlatform | 'all'>('all')
  const [selectedJob, setSelectedJob] = useState<JobLead | null>(null)
  const [clMap, setClMap] = useState<CoverLetterMap>(initialCLMap)
  const [descMap, setDescMap] = useState<JobDescriptionMap>(initialDescMap)
  const isMobile = useIsMobile()

  const emailsByCompany = new Map<string, ScannedEmail[]>()
  for (const result of savedEmails) {
    emailsByCompany.set(result.company.trim().toLowerCase(), result.emails)
  }

  const filtered = filterJobsByTab(jobs, tab, platformFilter)
  const platforms = [...new Set(jobs.map((j) => j.atsPlatform))].sort()
  const stats = computeJobStats(jobs)

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
      {/* Pipeline funnel */}
      <PipelineFunnel jobs={jobs} descMap={descMap} />

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

      {/* Job table / mobile cards */}
      {isMobile ? (
        <MobileDashboardCards jobs={filtered} clMap={clMap} onSelectJob={setSelectedJob} />
      ) : (
        <div className="island-shell overflow-hidden rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">Location</TableHead>
                <TableHead>ATS</TableHead>
                <TableHead className="hidden lg:table-cell">Fit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Cover Letter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length > 0 ? (
                filtered.map((job) => {
                  const difficulty = ATS_DIFFICULTY[job.atsPlatform]
                  const statusKey = getStatusColorKey(job.applicationStatus)
                  const cl = clMap[job.jobUrl]
                  return (
                    <TableRow
                      key={job.jobUrl}
                      className="cursor-pointer"
                      onClick={() => setSelectedJob(job)}
                    >
                      <TableCell className="font-semibold text-[var(--sea-ink)]">{job.company}</TableCell>
                      <TableCell className="text-[var(--sea-ink-soft)] max-w-[200px] truncate" title={job.role}>{job.role}</TableCell>
                      <TableCell className="text-[var(--sea-ink-soft)] max-w-[150px] truncate hidden sm:table-cell" title={job.location}>{job.location || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[var(--surface)] text-[var(--sea-ink-soft)]">{job.atsPlatform}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${DIFFICULTY_COLORS[difficulty]}`}>{difficulty}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {job.suitabilityScore != null ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            job.suitabilityScore >= 7 ? 'bg-green-500/15 text-green-700' :
                            job.suitabilityScore >= 4 ? 'bg-yellow-500/15 text-yellow-700' :
                            'bg-red-500/15 text-red-700'
                          }`}>
                            {job.suitabilityScore}/10
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--sea-ink-soft)]">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {statusKey ? (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[statusKey]}`}>{job.applicationStatus}</span>
                        ) : (
                          <span className="text-[var(--sea-ink-soft)]">{job.applicationStatus}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {cl ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700">
                            <CheckCircle className="h-3 w-3" /> Attached
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--sea-ink-soft)]">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell className="h-24 text-center text-[var(--sea-ink-soft)]" colSpan={7}>
                    No jobs match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

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
        description={selectedJob ? descMap[selectedJob.jobUrl] : undefined}
        onDescriptionChange={(jobUrl, desc) => {
          setDescMap((prev) => ({ ...prev, [jobUrl]: desc }))
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

