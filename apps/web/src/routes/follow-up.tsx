import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  EnvelopeSimple, PaperPlaneTilt, CalendarBlank, User,
  CircleNotch, CheckCircle, XCircle, PencilSimple, X,
} from '@phosphor-icons/react'
import { getJobs } from '#/lib/jobs.api.ts'
import { sendGmailEmail, getGmailStatus } from '#/lib/gmail.api.ts'
import type { JobLead } from '#/lib/types.ts'
import { requireAuth } from '#/lib/auth-guard.ts'

export const Route = createFileRoute('/follow-up')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [jobs, gmailStatus] = await Promise.all([getJobs(), getGmailStatus()])
    return { jobs, gmailConnected: gmailStatus.connected }
  },
  component: FollowUp,
})

function FollowUp() {
  const { jobs, gmailConnected } = Route.useLoaderData()

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
        <EnvelopeSimple className="h-6 w-6 text-[var(--lagoon)]" />
        Follow-Up Queue
      </h1>
      <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
        {followUpCandidates.length} jobs with recruiter emails that haven't received a follow-up yet.
      </p>

      {!gmailConnected && (
        <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          Gmail is not connected. Connect your account on the Email Scanner page to send emails directly.
        </div>
      )}

      {interviewStage.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-purple-700">
            Interview Stage ({interviewStage.length})
          </h2>
          <div className="space-y-2">
            {interviewStage.map((job, i) => (
              <FollowUpRow key={`${job.company}-${i}`} job={job} gmailConnected={gmailConnected} />
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
            <FollowUpRow key={`${job.company}-${i}`} job={job} gmailConnected={gmailConnected} />
          ))}
        </div>
      </section>
    </main>
  )
}

function FollowUpRow({ job, gmailConnected }: { job: JobLead; gmailConnected: boolean }) {
  const [composing, setComposing] = useState(false)

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
              <EnvelopeSimple className="h-3 w-3" />
              {email}
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-[var(--sea-ink-soft)]">
            <CalendarBlank className="h-3 w-3" />
            {job.date}
          </span>
          <button
            onClick={() => setComposing(!composing)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium no-underline transition ${
              composing
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-[var(--lagoon)] text-white hover:opacity-90'
            }`}
          >
            {composing ? (
              <>
                <X className="h-3 w-3" />
                Cancel
              </>
            ) : (
              <>
                <PencilSimple className="h-3 w-3" />
                Compose
              </>
            )}
          </button>
        </div>
      </div>

      {composing && (
        <ComposeEmail
          to={email}
          displayName={displayName}
          job={job}
          gmailConnected={gmailConnected}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  )
}

function ComposeEmail({
  to,
  displayName,
  job,
  gmailConnected,
  onClose,
}: {
  to: string
  displayName?: string
  job: JobLead
  gmailConnected: boolean
  onClose: () => void
}) {
  const firstName = displayName?.split(' ')[0]
  const defaultSubject = `Following up on ${job.role} application`
  const defaultBody = `Hi${firstName ? ' ' + firstName : ''},

I recently applied for the ${job.role} position at ${job.company} and wanted to follow up to express my continued interest.

Best regards`

  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(defaultBody)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      await sendGmailEmail({ data: { to, subject, body } })
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
        <CheckCircle className="h-5 w-5 shrink-0" />
        Email sent to {to}
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--line)] pt-3">
      {/* To field (read-only) */}
      <div className="flex items-center gap-2 text-sm">
        <span className="w-16 shrink-0 text-xs font-medium text-[var(--sea-ink-soft)]">To</span>
        <span className="text-[var(--sea-ink)]">{to}</span>
      </div>

      {/* Subject */}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs font-medium text-[var(--sea-ink-soft)]">Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
        />
      </div>

      {/* Body */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        className="w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--sea-ink-soft)]">
          {gmailConnected ? 'Sends via your connected Gmail account' : 'Gmail not connected — connect on Email Scanner page'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface-strong)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !gmailConnected || !subject.trim() || !body.trim()}
            className="flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {sending ? (
              <CircleNotch className="h-3 w-3 animate-spin" />
            ) : (
              <PaperPlaneTilt className="h-3 w-3" />
            )}
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
