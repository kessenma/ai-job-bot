import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { GearSix as SettingsIcon } from '@phosphor-icons/react'
import { getResumes, getCoverLetters } from '#/lib/resume.api.ts'
import { getGmailStatus } from '#/lib/gmail.api.ts'
import { getSheetsStatus } from '#/lib/sheets.api.ts'
import { getLlmStatus, getLlmModels } from '#/lib/llm.api.ts'
import { getLinkedInCredentialsStatus } from '#/lib/playwright.api.ts'
import { getApplyErrors } from '#/lib/error-log.api.ts'
import { getJobPreferences } from '#/lib/preferences.api.ts'
import { getExperienceEntries } from '#/lib/experience.api.ts'
import { getGeneratedLetters } from '#/lib/cover-letter-gen.api.ts'
import { getDriveWorkspaceStatus } from '#/lib/drive-workspace.api.ts'
import { getAllCliStatuses } from '#/lib/cli-detect.api.ts'
import { getAppConfig } from '#/lib/config.api.ts'
import { requireAuth } from '#/lib/auth-guard.ts'
import { SetupGuide } from '#/components/setup/SetupGuide.tsx'
import { ConnectionsSection } from '#/components/settings/ConnectionsSection.tsx'
import { DriveWorkspaceSection } from '#/components/settings/DriveWorkspaceSection.tsx'
import { JobPreferencesSection } from '#/components/settings/JobPreferencesSection.tsx'
import { ResumeSection } from '#/components/settings/ResumeSection.tsx'
import { CoverLetterManagement } from '#/components/settings/CoverLetterManagement.tsx'
import { CoverLetterGenerator } from '#/components/settings/CoverLetterGenerator.tsx'
import { LlmManagement } from '#/components/settings/LlmManagement.tsx'
import { ApplyErrorLog } from '#/components/settings/ApplyErrorLog.tsx'
import { LogoutSection } from '#/components/settings/LogoutSection.tsx'
import { ExperienceProfileSection } from '#/components/settings/ExperienceProfileSection.tsx'
import { CreditsSection } from '#/components/settings/CreditsSection.tsx'
import { LlmSetupWizard } from '#/components/setup/LlmSetupWizard.tsx'

export const Route = createFileRoute('/settings')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [resumes, coverLetters, gmailStatus, sheetsStatus, llmStatus, llmModels, applyErrors, jobPreferences, linkedInCredentialsStatus, experienceEntries, generatedLetters, workspaceStatus, cliStatuses, appConfig] = await Promise.all([
      getResumes(),
      getCoverLetters(),
      getGmailStatus(),
      getSheetsStatus(),
      getLlmStatus(),
      getLlmModels(),
      getApplyErrors({ data: { dismissed: false } }),
      getJobPreferences(),
      getLinkedInCredentialsStatus(),
      getExperienceEntries(),
      getGeneratedLetters({ data: {} }),
      getDriveWorkspaceStatus(),
      getAllCliStatuses(),
      getAppConfig(),
    ])
    return { resumes, coverLetters, gmailStatus, sheetsStatus, llmStatus, llmModels, applyErrors, jobPreferences, linkedInCredentialsStatus, experienceEntries, generatedLetters, workspaceStatus, cliStatuses, appConfig }
  },
  component: Settings,
})

function Settings() {
  const { resumes: initialResumes, coverLetters: initialCoverLetters, gmailStatus, sheetsStatus, llmStatus, llmModels, applyErrors, jobPreferences, linkedInCredentialsStatus, experienceEntries, generatedLetters, workspaceStatus: initialWorkspaceStatus, cliStatuses, appConfig } = Route.useLoaderData()
  const [resumes, setResumes] = useState(initialResumes)
  const [coverLetters, setCoverLetters] = useState(initialCoverLetters)
  const [generatedCoverLetters, setGeneratedCoverLetters] = useState(generatedLetters)
  const [workspaceStatus, setWorkspaceStatus] = useState(initialWorkspaceStatus)

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-[var(--sea-ink)]">
        <SettingsIcon className="h-6 w-6 text-[var(--lagoon)]" />
        Settings
      </h1>

      {/* Setup Guide (one-time config) */}
      <SetupGuide
        gmailStatus={gmailStatus}
        sheetsStatus={sheetsStatus}
        workspaceStatus={workspaceStatus}
        onWorkspaceChange={setWorkspaceStatus}
      />

      {/* LLM Provider Setup */}
      <LlmSetupWizard
        initialCliStatuses={cliStatuses}
        initialLlmStatus={llmStatus as { connected: boolean; status: string; model_loaded?: boolean; active_model?: string | null }}
        initialSetupCompleted={appConfig.llm_setup_completed === 'true'}
      />

      {/* Connections overview */}
      <ConnectionsSection
        gmailStatus={gmailStatus}
        sheetsStatus={sheetsStatus}
        linkedInCredentialsStatus={linkedInCredentialsStatus}
        workspaceConfigured={workspaceStatus.configured}
      />

      {/* Drive Workspace (standalone section outside setup guide) */}
      <DriveWorkspaceSection
        workspaceStatus={workspaceStatus}
        onStatusChange={setWorkspaceStatus}
      />

      {/* Job Preferences */}
      <JobPreferencesSection initialPrefs={jobPreferences} />

      {/* Experience Profile */}
      <ExperienceProfileSection
        initialEntries={experienceEntries}
        llmConnected={(llmStatus as { connected: boolean }).connected}
        claudeCliAvailable={cliStatuses.claude.available && cliStatuses.claude.authenticated}
        copilotCliAvailable={cliStatuses.gh.available && cliStatuses.gh.authenticated}
        resumes={resumes.map((r) => ({ name: r.name, originalName: r.originalName, isPrimary: r.isPrimary }))}
      />

      {/* Apply Error Log */}
      <ApplyErrorLog errors={applyErrors} />

      <ResumeSection resumes={resumes} onResumesChange={setResumes} workspaceConfig={workspaceStatus.config} />
      <CoverLetterManagement
        coverLetters={coverLetters}
        onCoverLettersChange={setCoverLetters}
        generatedLetters={generatedCoverLetters}
        onGeneratedLettersChange={setGeneratedCoverLetters}
        workspaceConfig={workspaceStatus.config}
      />
      <CoverLetterGenerator initialHistory={generatedCoverLetters} availableSamples={coverLetters} />
      <LlmManagement initialStatus={llmStatus} initialModels={llmModels} />
      <LogoutSection />
      <CreditsSection />
    </main>
  )
}
