import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  GearSix as SettingsIcon, EnvelopeSimple, Table, ArrowSquareOut,
  CheckCircle, XCircle, Tray,
} from '@phosphor-icons/react'
import { getResume, getCoverLetters } from '#/lib/resume.api.ts'
import { getGmailStatus } from '#/lib/gmail.api.ts'
import { getSheetsStatus } from '#/lib/sheets.api.ts'
import { getLlmStatus, getLlmModels } from '#/lib/llm.api.ts'
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
              to="/email-scan"
              className="text-xs font-medium text-[var(--lagoon-deep)] hover:underline"
            >
              <Tray className="mr-1 inline h-3 w-3" />
              Manage
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
        </div>
      </section>

      <ResumeSection resume={resume} onResumeChange={setResume} />
      <CoverLetterManagement coverLetters={coverLetters} onCoverLettersChange={setCoverLetters} />
      <LlmManagement initialStatus={llmStatus} initialModels={llmModels} />
      <LogoutSection />
    </main>
  )
}
