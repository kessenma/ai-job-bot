import { createFileRoute } from '@tanstack/react-router'
import { Bot, ExternalLink, Shield, ShieldAlert, ShieldX } from 'lucide-react'
import { getJobs } from '#/lib/jobs.api.ts'
import { ATS_DIFFICULTY } from '#/lib/ats-classifier.ts'
import type { JobLead } from '#/lib/types.ts'
import { requireAuth } from '#/lib/auth-guard.ts'

export const Route = createFileRoute('/auto-apply')({
  beforeLoad: requireAuth,
  loader: () => getJobs(),
  component: AutoApply,
})

function AutoApply() {
  const jobs = Route.useLoaderData()

  const candidates = jobs.filter((j) => {
    const activity = j.activityStatus.toLowerCase()
    const status = j.applicationStatus.toLowerCase()
    return (
      !activity.includes('expired') &&
      !activity.includes('will not') &&
      !status.includes('submitted') &&
      !status.includes('rejected') &&
      !status.includes('interview') &&
      !status.includes('applied') &&
      j.jobUrl
    )
  })

  const byDifficulty = {
    easy: candidates.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'easy'),
    medium: candidates.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'medium'),
    hard: candidates.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'hard'),
  }

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <Bot className="h-6 w-6 text-[var(--lagoon)]" />
        Auto Apply Queue
      </h1>
      <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
        Jobs grouped by ATS difficulty. "Easy" platforms (Recruitee, Join, Lever) have simple forms
        that can be filled automatically. "Medium" may have CAPTCHAs. "Hard" requires manual work.
      </p>

      {(['easy', 'medium', 'hard'] as const).map((level) => (
        <section key={level} className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
            {level === 'easy' ? (
              <Shield className="h-5 w-5 text-green-600" />
            ) : level === 'medium' ? (
              <ShieldAlert className="h-5 w-5 text-yellow-600" />
            ) : (
              <ShieldX className="h-5 w-5 text-red-600" />
            )}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                level === 'easy'
                  ? 'bg-green-500/15 text-green-700'
                  : level === 'medium'
                    ? 'bg-yellow-500/15 text-yellow-700'
                    : 'bg-red-500/15 text-red-700'
              }`}
            >
              {level}
            </span>
            {byDifficulty[level].length} jobs
          </h2>

          {byDifficulty[level].length === 0 ? (
            <p className="text-sm text-[var(--sea-ink-soft)]">No jobs at this difficulty level.</p>
          ) : (
            <div className="space-y-2">
              {byDifficulty[level].map((job, i) => (
                <AutoApplyRow key={`${job.company}-${i}`} job={job} />
              ))}
            </div>
          )}
        </section>
      ))}

      <section className="island-shell rounded-xl p-6">
        <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">How Auto-Apply Works</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--sea-ink-soft)]">
          <li>Playwright opens the job URL in a headless browser</li>
          <li>The ATS handler identifies form fields and fills them with your profile</li>
          <li>Resume and cover letter are uploaded</li>
          <li>If a CAPTCHA is detected, the job is flagged for manual completion</li>
          <li>If custom questions are found, they're logged for you to answer</li>
          <li>Results are written back to the spreadsheet</li>
        </ol>
        <p className="mt-4 text-xs text-[var(--sea-ink-soft)] opacity-70">
          Auto-apply is not yet wired up — this page shows what's in the queue.
          The Playwright handlers need to be built per ATS platform.
        </p>
      </section>
    </main>
  )
}

function AutoApplyRow({ job }: { job: JobLead }) {
  return (
    <div className="island-shell flex items-center justify-between rounded-xl p-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--sea-ink)]">{job.company}</span>
          <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
            {job.atsPlatform}
          </span>
        </div>
        <div className="text-sm text-[var(--sea-ink-soft)]">{job.role}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--sea-ink-soft)]">{job.activityStatus}</span>
        <a
          href={job.jobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--lagoon-deep)] no-underline hover:bg-[var(--surface-strong)]"
        >
          <ExternalLink className="h-3 w-3" />
          View
        </a>
      </div>
    </div>
  )
}
