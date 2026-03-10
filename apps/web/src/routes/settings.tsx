import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  GearSix as SettingsIcon, EnvelopeSimple, Table, ArrowSquareOut,
  CheckCircle, XCircle, CircleNotch, LinkedinLogo, Heart,
} from '@phosphor-icons/react'
import { getResume, getCoverLetters } from '#/lib/resume.api.ts'
import { getGmailStatus } from '#/lib/gmail.api.ts'
import { getSheetsStatus } from '#/lib/sheets.api.ts'
import { getLlmStatus, getLlmModels } from '#/lib/llm.api.ts'
import { testLinkedInLogin } from '#/lib/playwright.api.ts'
import { requireAuth } from '#/lib/auth-guard.ts'
import { ResumeSection } from '#/components/settings/ResumeSection.tsx'
import { CoverLetterManagement } from '#/components/settings/CoverLetterManagement.tsx'
import { LlmManagement } from '#/components/settings/LlmManagement.tsx'
import { LogoutSection } from '#/components/settings/LogoutSection.tsx'

export const Route = createFileRoute('/settings')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [resume, coverLetters, gmailStatus, sheetsStatus, llmStatus, llmModels] = await Promise.all([
      getResume(),
      getCoverLetters(),
      getGmailStatus(),
      getSheetsStatus(),
      getLlmStatus(),
      getLlmModels(),
    ])
    return { resume, coverLetters, gmailStatus, sheetsStatus, llmStatus, llmModels }
  },
  component: Settings,
})

function Settings() {
  const { resume: initialResume, coverLetters: initialCoverLetters, gmailStatus, sheetsStatus, llmStatus, llmModels } = Route.useLoaderData()
  const [resume, setResume] = useState(initialResume)
  const [coverLetters, setCoverLetters] = useState(initialCoverLetters)

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <SettingsIcon className="h-6 w-6 text-[var(--lagoon)]" />
        Settings
      </h1>

      {/* Connections overview */}
      <section className="island-shell mb-6 rounded-2xl p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
          Connections
        </h2>
        <div className="space-y-3">
          {/* Gmail */}
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <EnvelopeSimple className="h-5 w-5 shrink-0 text-[var(--lagoon)]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--sea-ink)]">Gmail</span>
                {gmailStatus.connected ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3 w-3" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-[var(--sea-ink-soft)]">
                    <XCircle className="h-3 w-3" /> Not connected
                  </span>
                )}
              </div>
              {gmailStatus.savedEmailCount > 0 && (
                <div className="text-xs text-[var(--sea-ink-soft)]">
                  {gmailStatus.savedEmailCount} emails scanned and saved
                </div>
              )}
            </div>
            <Link
              to="/setup"
              className="text-xs font-medium text-[var(--lagoon-deep)] hover:underline"
            >
              <EnvelopeSimple className="mr-1 inline h-3 w-3" />
              Setup
            </Link>
          </div>

          {/* Google Sheets */}
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <Table className="h-5 w-5 shrink-0 text-[var(--lagoon)]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--sea-ink)]">Google Sheets</span>
                {sheetsStatus.configured && sheetsStatus.authenticated ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3 w-3" /> Connected
                  </span>
                ) : sheetsStatus.configured ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <XCircle className="h-3 w-3" /> Not authenticated
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-[var(--sea-ink-soft)]">
                    <XCircle className="h-3 w-3" /> Not configured
                  </span>
                )}
              </div>
              {sheetsStatus.sheetUrl && (
                <a
                  href={sheetsStatus.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs text-[var(--lagoon-deep)] hover:underline"
                >
                  {sheetsStatus.sheetUrl} <ArrowSquareOut className="mb-0.5 inline h-3 w-3" />
                </a>
              )}
            </div>
            <Link
              to="/sheets"
              className="text-xs font-medium text-[var(--lagoon-deep)] hover:underline"
            >
              <Table className="mr-1 inline h-3 w-3" />
              Manage
            </Link>
          </div>
          {/* LinkedIn */}
          <LinkedInConnectionRow />
        </div>
      </section>

      <ResumeSection resume={resume} onResumeChange={setResume} />
      <CoverLetterManagement coverLetters={coverLetters} onCoverLettersChange={setCoverLetters} />
      <LlmManagement initialStatus={llmStatus} initialModels={llmModels} />
      <LogoutSection />
      <CreditsSection />
    </main>
  )
}

function LinkedInConnectionRow() {
  const [status, setStatus] = useState<'idle' | 'testing' | 'verifying' | 'connected' | 'failed' | 'not_configured' | 'captcha_blocked' | 'verification_pending'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const handleTest = async () => {
    setStatus('testing')
    setMessage(null)
    try {
      const res = await testLinkedInLogin({ data: { waitForVerification: false } })
      setStatus(res.status as typeof status)
      setMessage(res.message)
    } catch (err) {
      setStatus('failed')
      setMessage(err instanceof Error ? err.message : 'Connection test failed')
    }
  }

  const handleVerify = async () => {
    setStatus('verifying')
    setMessage('Waiting for you to approve on your LinkedIn app (up to 60s)...')
    try {
      const res = await testLinkedInLogin({ data: { waitForVerification: true } })
      setStatus(res.status as typeof status)
      setMessage(res.message)
    } catch (err) {
      setStatus('failed')
      setMessage(err instanceof Error ? err.message : 'Verification failed')
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <LinkedinLogo className="h-5 w-5 shrink-0 text-[var(--lagoon)]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--sea-ink)]">LinkedIn</span>
          {status === 'connected' ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="h-3 w-3" /> Connected
            </span>
          ) : status === 'not_configured' ? (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <XCircle className="h-3 w-3" /> Env vars not set
            </span>
          ) : status === 'captcha_blocked' ? (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <XCircle className="h-3 w-3" /> Captcha required
            </span>
          ) : status === 'verification_pending' ? (
            <span className="flex items-center gap-1 text-xs text-blue-600">
              <CircleNotch className="h-3 w-3" /> Awaiting approval
            </span>
          ) : status === 'failed' ? (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <XCircle className="h-3 w-3" /> Failed
            </span>
          ) : null}
        </div>
        {message && (
          <div className="text-xs text-[var(--sea-ink-soft)]">{message}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status === 'verification_pending' && (
          <button
            onClick={handleVerify}
            className="flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            <CheckCircle className="h-3 w-3" />
            I Approved It
          </button>
        )}
        <button
          onClick={handleTest}
          disabled={status === 'testing' || status === 'verifying'}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--lagoon-deep)] hover:underline disabled:opacity-50"
        >
          {status === 'testing' || status === 'verifying' ? (
            <>
              <CircleNotch className="h-3 w-3 animate-spin" />
              {status === 'verifying' ? 'Waiting...' : 'Testing...'}
            </>
          ) : (
            <>
              <LinkedinLogo className="h-3 w-3" />
              Test Login
            </>
          )}
        </button>
      </div>
    </div>
  )
}

const CREDITS = [
  {
    name: 'Ammar Abdur Raheman',
    project: 'linkedin-easy-apply',
    description: 'LinkedIn Easy Apply automation with Playwright — login, search, and form-fill patterns.',
    url: 'https://github.com/AmmarAR97/linkedin-easy-apply',
    license: 'MIT',
  },
  {
    name: 'Unisa Bangura',
    project: 'Workday-Application-Automator',
    description: 'Workday application automation — auto-fills contact, education, and demographic info.',
    url: 'https://github.com/ubangura/Workday-Application-Automator',
    license: 'ISC',
  },
]

function CreditsSection() {
  return (
    <section className="island-shell mb-6 mt-6 rounded-2xl p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        <Heart className="h-5 w-5 text-[var(--lagoon)]" />
        Credits
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        This project builds on the work of these open-source authors and projects.
      </p>
      <div className="space-y-3">
        {CREDITS.map((c) => (
          <div key={c.project} className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--sea-ink)]">{c.project}</span>
                <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
                  {c.license}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
                by {c.name}
              </div>
              <div className="mt-1 text-sm text-[var(--sea-ink-soft)]">
                {c.description}
              </div>
            </div>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-medium text-[var(--lagoon-deep)] hover:underline"
            >
              <ArrowSquareOut className="mr-1 inline h-3 w-3" />
              GitHub
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}
