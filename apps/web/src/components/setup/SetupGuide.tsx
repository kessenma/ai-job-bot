import { useState } from 'react'
import {
  BookOpen, CaretDown, CaretUp, Key, EnvelopeSimple, GoogleDriveLogo,
} from '@phosphor-icons/react'
import { StatusPill } from '#/components/ui/StatusPill.tsx'
import { SetupSection } from './SetupSection.tsx'
import { EnvBlock } from './EnvBlock.tsx'
import { OAUTH_STEPS, GMAIL_STEPS } from './setup-steps.tsx'
import { DriveWorkspaceSection } from '#/components/settings/DriveWorkspaceSection.tsx'
import type { WorkspaceStatus } from '#/lib/drive-workspace.api.ts'

export function SetupGuide({
  gmailStatus,
  sheetsStatus,
  workspaceStatus,
  onWorkspaceChange,
}: {
  gmailStatus: { connected: boolean; configured: boolean }
  sheetsStatus: { configured: boolean; authenticated: boolean; sheetUrl: string | null }
  workspaceStatus: WorkspaceStatus
  onWorkspaceChange: (status: WorkspaceStatus) => void
}) {
  const isFullyConnected = gmailStatus.connected && (sheetsStatus.configured || workspaceStatus.configured)
  const [guideOpen, setGuideOpen] = useState(!isFullyConnected)

  return (
    <section className="island-shell overflow-hidden rounded-2xl">
      <button
        onClick={() => setGuideOpen(!guideOpen)}
        className="flex w-full items-center justify-between p-6 text-left"
      >
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-[var(--lagoon)]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Setup Guide</h2>
            <p className="text-sm text-[var(--sea-ink-soft)]">
              Google OAuth, Gmail, and Drive workspace configuration
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill variant={isFullyConnected ? 'success' : 'warning'}>
            {isFullyConnected ? 'Complete' : 'Incomplete'}
          </StatusPill>
          {guideOpen ? (
            <CaretUp className="h-4 w-4 text-[var(--sea-ink-soft)]" />
          ) : (
            <CaretDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />
          )}
        </div>
      </button>

      {guideOpen && (
        <div className="border-t border-[var(--line)] p-6 pt-4 space-y-8">
          {/* Section 1: OAuth Credentials */}
          <SetupSection
            icon={<Key className="h-5 w-5 text-[var(--lagoon)]" />}
            title="1. Google OAuth Credentials"
            subtitle="Create a GCP project and OAuth client to authenticate with Google APIs."
            status={gmailStatus.configured ? 'done' : 'pending'}
            statusText={gmailStatus.configured ? 'Configured' : 'Not configured'}
            steps={OAUTH_STEPS}
          />

          {/* Env file */}
          <div className="island-shell rounded-2xl p-6">
            <h3 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">
              Add credentials to your .env file
            </h3>
            <p className="mb-3 text-sm text-[var(--sea-ink-soft)]">
              Create a <code>.env</code> file in the <code>app/</code> directory (copy from{' '}
              <code>.env.example</code>) and paste your credentials:
            </p>
            <EnvBlock />
            <p className="mt-3 text-sm text-[var(--sea-ink-soft)]">
              After saving, restart the dev server.
            </p>
          </div>

          {/* Section 2: Gmail Connection */}
          <SetupSection
            icon={<EnvelopeSimple className="h-5 w-5 text-[var(--lagoon)]" />}
            title="2. Connect Gmail"
            subtitle="Add yourself as a test user and connect your Gmail account for email scanning."
            status={gmailStatus.connected ? 'done' : gmailStatus.configured ? 'ready' : 'pending'}
            statusText={
              gmailStatus.connected
                ? 'Connected'
                : gmailStatus.configured
                  ? 'Ready to connect'
                  : 'Needs OAuth credentials first'
            }
            steps={GMAIL_STEPS}
          />

          {/* Section 3: Drive Workspace */}
          <SetupSection
            icon={<GoogleDriveLogo className="h-5 w-5 text-[var(--lagoon)]" />}
            title="3. Drive Workspace"
            subtitle="Set up your ai-job-bot folder with job tracking sheet and document folders."
            status={workspaceStatus.configured ? 'done' : gmailStatus.connected ? 'ready' : 'pending'}
            statusText={
              workspaceStatus.configured
                ? 'Workspace active'
                : gmailStatus.connected
                  ? 'Ready to set up'
                  : 'Connect Google first'
            }
            steps={[]}
          />

          {/* Drive Workspace setup */}
          <DriveWorkspaceSection
            workspaceStatus={workspaceStatus}
            onStatusChange={onWorkspaceChange}
          />
        </div>
      )}
    </section>
  )
}
