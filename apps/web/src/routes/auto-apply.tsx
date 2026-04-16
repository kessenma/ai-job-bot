import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Robot, Shield, ShieldWarning, ShieldSlash,
  EnvelopeSimple, Queue,
} from '@phosphor-icons/react'
import { getJobs } from '#/lib/jobs.api.ts'
import { ATS_DIFFICULTY } from '#/lib/ats-classifier.ts'
import { requireAuth } from '#/lib/auth-guard.ts'
import {
  getScreenshots, getApplyProfile,
  type ApplyProfile, type FillFormResult,
} from '#/lib/playwright.api.ts'
import { getResumes } from '#/lib/resume.api.ts'
import { getGmailStatus } from '#/lib/gmail.api.ts'
import { getFollowUpCandidates, getAutoApplyCandidates } from '#/lib/job-filters.ts'
import { getUnansweredQuestions } from '#/lib/questions.api.ts'
import { getJobPreferences } from '#/lib/preferences.api.ts'
import { DIFFICULTY_COLORS } from '#/lib/color-maps.ts'
import { ProfileForm } from '#/components/auto-apply/ProfileForm.tsx'
import { JobUrlActions } from '#/components/auto-apply/JobUrlActions.tsx'
import { ScreenshotGallery } from '#/components/auto-apply/ScreenshotGallery.tsx'
import { FillResultCard } from '#/components/auto-apply/FillResultCard.tsx'
import { AutoApplyRow } from '#/components/auto-apply/AutoApplyRow.tsx'
import { UnansweredQuestions } from '#/components/auto-apply/UnansweredQuestions.tsx'
import { ReviewQueue } from '#/components/auto-apply/ReviewQueue.tsx'
import { getApplicationQueue } from '#/lib/queue.api.ts'
import { getAllCliStatuses } from '#/lib/cli-detect.api.ts'
import { getLlmStatus } from '#/lib/llm.api.ts'
import { FollowUpRow } from '#/components/follow-up/FollowUpRow.tsx'

export const Route = createFileRoute('/auto-apply')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [jobs, screenshots, profile, resumes, gmailStatus, unansweredQuestions, jobPreferences, queueItems, cliStatuses, llmStatus] = await Promise.all([
      getJobs(), getScreenshots(), getApplyProfile(), getResumes(), getGmailStatus(), getUnansweredQuestions(), getJobPreferences(), getApplicationQueue(), getAllCliStatuses(), getLlmStatus(),
    ])
    return {
      jobs, screenshots, profile, hasResume: resumes.length > 0,
      gmailConnected: gmailStatus.connected, unansweredQuestions, jobPreferences, queueItems,
      claudeCliAvailable: cliStatuses.claude.available && cliStatuses.claude.authenticated,
      copilotCliAvailable: cliStatuses.gh.available && cliStatuses.gh.authenticated,
      llmConnected: (llmStatus as { connected: boolean }).connected,
    }
  },
  component: AutoApply,
})

function AutoApply() {
  const { jobs, screenshots, profile: initialProfile, hasResume, gmailConnected, unansweredQuestions, jobPreferences, queueItems, claudeCliAvailable, copilotCliAvailable, llmConnected } = Route.useLoaderData()
  const [tab, setTab] = useState<'queue' | 'review' | 'followup'>('queue')
  const [profile, setProfile] = useState<ApplyProfile | null>(initialProfile)
  const [fillResult, setFillResult] = useState<FillFormResult | null>(null)

  const candidates = getAutoApplyCandidates(jobs, jobPreferences)

  const byDifficulty = {
    easy: candidates.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'easy'),
    medium: candidates.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'medium'),
    hard: candidates.filter((j) => ATS_DIFFICULTY[j.atsPlatform] === 'hard'),
  }

  const followUpCandidates = getFollowUpCandidates(jobs)
  const interviewStage = followUpCandidates.filter((j) =>
    j.applicationStatus.toLowerCase().includes('interview'),
  )
  const submittedStage = followUpCandidates.filter(
    (j) => !j.applicationStatus.toLowerCase().includes('interview'),
  )

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <Robot className="h-6 w-6 text-[var(--lagoon)]" />
        Apply
      </h1>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Auto-apply to jobs and follow up with recruiters.
      </p>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-full bg-[var(--surface-strong)] p-1 w-fit">
        {([
          { key: 'queue' as const, label: 'Auto Apply', icon: <Robot className="h-4 w-4" />, count: candidates.length },
          { key: 'review' as const, label: 'Review', icon: <Queue className="h-4 w-4" />, count: queueItems.filter((i) => i.status === 'pending' || i.status === 'approved').length },
          { key: 'followup' as const, label: 'Follow Up', icon: <EnvelopeSimple className="h-4 w-4" />, count: followUpCandidates.length },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? 'bg-[var(--surface)] text-[var(--sea-ink)] shadow-sm'
                : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
            }`}
          >
            {t.icon}
            {t.label}
            <span className="ml-1 text-xs opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'review' ? (
        <ReviewQueue
          items={queueItems}
          onRefresh={() => window.location.reload()}
        />
      ) : tab === 'queue' ? (
        <>
          {/* Apply Profile Section */}
          <ProfileForm
            profile={profile}
            onSave={setProfile}
            hasResume={hasResume}
            claudeCliAvailable={claudeCliAvailable}
            copilotCliAvailable={copilotCliAvailable}
            llmConnected={llmConnected}
          />

          {/* Unanswered Questions */}
          <UnansweredQuestions questions={unansweredQuestions} />

          {/* URL Input + Actions Section */}
          <JobUrlActions profile={profile} onFillResult={setFillResult} />

          {/* Fill Form Result */}
          {fillResult && <FillResultCard result={fillResult} onClose={() => setFillResult(null)} />}

          {/* Screenshot Gallery */}
          <ScreenshotGallery screenshots={screenshots} />

          {/* Difficulty groups */}
          {(['easy', 'medium', 'hard'] as const).map((level) => (
            <section key={level} className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
                {level === 'easy' ? (
                  <Shield className="h-5 w-5 text-green-600" />
                ) : level === 'medium' ? (
                  <ShieldWarning className="h-5 w-5 text-yellow-600" />
                ) : (
                  <ShieldSlash className="h-5 w-5 text-red-600" />
                )}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${DIFFICULTY_COLORS[level]}`}>
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
        </>
      ) : (
        <>
          <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
            {followUpCandidates.length} jobs with recruiter emails that haven't received a follow-up yet.
          </p>

          {!gmailConnected && (
            <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              Gmail is not connected. Connect your account in Settings to send emails directly.
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
            {submittedStage.length === 0 ? (
              <p className="text-sm text-[var(--sea-ink-soft)]">No follow-up candidates right now.</p>
            ) : (
              <div className="space-y-2">
                {submittedStage.map((job, i) => (
                  <FollowUpRow key={`${job.company}-${i}`} job={job} gmailConnected={gmailConnected} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
