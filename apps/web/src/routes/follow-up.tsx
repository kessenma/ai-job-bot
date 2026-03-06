import { createFileRoute } from '@tanstack/react-router'
import { Mail, Send, Calendar, User } from 'lucide-react'
import { getJobs } from '#/lib/jobs.api.ts'
import type { JobLead } from '#/lib/types.ts'
import { requireAuth } from '#/lib/auth-guard.ts'

export const Route = createFileRoute('/follow-up')({
  beforeLoad: requireAuth,
  loader: () => getJobs(),
  component: FollowUp,
})

function FollowUp() {
  const jobs = Route.useLoaderData()

  const followUpCandidates = jobs.filter((j) => {
    const status = j.applicationStatus.toLowerCase()
    const hasEmail =
      j.recruiterEmail &&
      j.recruiterEmail !== 'N/A' &&
      !j.recruiterEmail.includes('Unavailable') &&
      j.recruiterEmail !== 'Expired' &&
      !j.recruiterEmail.includes('Not Found')
    const notFollowedUp = !j.followUpEmailStatus?.toLowerCase().includes('sent')
    const isActive =
      status.includes('submitted') || status.includes('applied') || status.includes('interview')

    return hasEmail && notFollowedUp && isActive
  })

  const interviewStage = followUpCandidates.filter((j) =>
    j.applicationStatus.toLowerCase().includes('interview'),
  )
  const submittedStage = followUpCandidates.filter(
    (j) => !j.applicationStatus.toLowerCase().includes('interview'),
  )

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <Mail className="h-6 w-6 text-[var(--lagoon)]" />
        Follow-Up Queue
      </h1>
      <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
        {followUpCandidates.length} jobs with recruiter emails that haven't received a follow-up yet.
      </p>

      {interviewStage.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-purple-700">
            Interview Stage ({interviewStage.length})
          </h2>
          <div className="space-y-2">
            {interviewStage.map((job, i) => (
              <FollowUpRow key={`${job.company}-${i}`} job={job} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-[var(--sea-ink)]">
          Submitted — No Response ({submittedStage.length})
        </h2>
        <div className="space-y-2">
          {submittedStage.map((job, i) => (
            <FollowUpRow key={`${job.company}-${i}`} job={job} />
          ))}
        </div>
      </section>
    </main>
  )
}

function FollowUpRow({ job }: { job: JobLead }) {
  // Extract a clean email (some have names appended like "email (Name)")
  const emailMatch = job.recruiterEmail.match(/[\w.+-]+@[\w.-]+\.\w+/)
  const email = emailMatch ? emailMatch[0].trim() : job.recruiterEmail

  // Extract recruiter name from LinkedIn URL if possible
  const linkedinName = job.recruiterLinkedin?.match(/linkedin\.com\/in\/([\w-]+)/)?.[1]
  const displayName = linkedinName
    ? linkedinName
        .split('-')
        .filter((s) => s.length > 1 && !/^\d+/.test(s))
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ')
    : undefined

  return (
    <div className="island-shell rounded-xl p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--sea-ink)]">{job.company}</span>
            {job.applicationStatus.toLowerCase().includes('interview') && (
              <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-700">
                Interview
              </span>
            )}
          </div>
          <div className="text-sm text-[var(--sea-ink-soft)]">{job.role}</div>
          <div className="mt-1 flex items-center gap-3 text-xs text-[var(--sea-ink-soft)]">
            {displayName && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {displayName}
              </span>
            )}
            <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-[var(--lagoon-deep)]">
              <Mail className="h-3 w-3" />
              {email}
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-[var(--sea-ink-soft)]">
            <Calendar className="h-3 w-3" />
            {job.date}
          </span>
          <a
            href={`mailto:${email}?subject=Following up on ${job.role} application&body=Hi${displayName ? ' ' + displayName.split(' ')[0] : ''},%0D%0A%0D%0AI recently applied for the ${job.role} position at ${job.company} and wanted to follow up to express my continued interest.%0D%0A%0D%0ABest regards`}
            className="rounded-full bg-[var(--lagoon)] px-4 py-1.5 text-xs font-medium text-white no-underline hover:opacity-90"
          >
            <Send className="h-3 w-3" />
            Draft Email
          </a>
        </div>
      </div>
    </div>
  )
}
