import { useState, useCallback } from 'react'
import {
  FolderOpen, CircleNotch, CheckCircle, ArrowSquareOut,
  ArrowsClockwise, LinkBreak, Table, Folder, GoogleDriveLogo,
} from '@phosphor-icons/react'
import {
  setupDriveWorkspace,
  syncDriveWorkspace,
  disconnectDriveWorkspace,
  type WorkspaceStatus,
} from '#/lib/drive-workspace.api.ts'
import { setSheetsUrl, removeSheetsUrl } from '#/lib/sheets.api.ts'
import { CollapsibleSection } from '#/components/ui/CollapsibleSection.tsx'

export function DriveWorkspaceSection({
  workspaceStatus,
  onStatusChange,
}: {
  workspaceStatus: WorkspaceStatus
  onStatusChange: (status: WorkspaceStatus) => void
}) {
  const [setting, setSetting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [migrationResult, setMigrationResult] = useState<{ resumes: number; coverLetters: number } | null>(null)

  // Manual sheet URL override state
  const [manualUrl, setManualUrl] = useState('')
  const [savingManual, setSavingManual] = useState(false)

  const handleSetup = useCallback(async () => {
    setSetting(true)
    setError(null)
    setMigrationResult(null)
    try {
      const result = await setupDriveWorkspace()
      setMigrationResult(result.migrated)
      onStatusChange({
        configured: true,
        authenticated: true,
        config: result.config,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed')
    } finally {
      setSetting(false)
    }
  }, [onStatusChange])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      const status = await syncDriveWorkspace()
      onStatusChange(status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [onStatusChange])

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectDriveWorkspace()
      onStatusChange({ configured: false, authenticated: workspaceStatus.authenticated, config: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
    }
  }, [workspaceStatus.authenticated, onStatusChange])

  const handleManualSheetSave = useCallback(async () => {
    if (!manualUrl.trim()) return
    setSavingManual(true)
    setError(null)
    try {
      await setSheetsUrl({ data: { url: manualUrl.trim() } })
      setManualUrl('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save sheet URL')
    } finally {
      setSavingManual(false)
    }
  }, [manualUrl])

  const { config } = workspaceStatus
  const rootUrl = config ? `https://drive.google.com/drive/folders/${config.rootFolderId}` : null

  return (
    <section className="island-shell rounded-2xl p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        <GoogleDriveLogo className="h-5 w-5 text-[var(--lagoon)]" />
        Drive Workspace
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        All your job tracking data lives in a single <code className="rounded bg-[var(--surface-strong)] px-1 py-0.5 text-xs">ai-job-bot</code> folder on Google Drive.
      </p>

      {!workspaceStatus.authenticated ? (
        /* State 1: Not connected to Google */
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--sea-ink-soft)]">
          Connect your Google account first to set up the Drive workspace.
        </div>
      ) : !config ? (
        /* State 2: Connected but no workspace */
        <div className="space-y-3">
          <div className="rounded-xl border border-dashed border-[var(--lagoon)]/40 bg-[var(--lagoon)]/5 p-4">
            <p className="mb-3 text-sm text-[var(--sea-ink)]">
              This will create an <strong>ai-job-bot</strong> folder in your Google Drive containing:
            </p>
            <ul className="mb-4 space-y-1.5 text-sm text-[var(--sea-ink-soft)]">
              <li className="flex items-center gap-2">
                <Table className="h-4 w-4 text-[var(--lagoon)]" />
                <strong>Job Tracking</strong> spreadsheet with pre-configured columns
              </li>
              <li className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-[var(--lagoon)]" />
                <strong>Resumes</strong> folder for your resume files
              </li>
              <li className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-[var(--lagoon)]" />
                <strong>Cover Letters</strong> folder for cover letter samples
              </li>
            </ul>
            <p className="mb-4 text-xs text-[var(--sea-ink-soft)]">
              If you already have files in the old "Job App Bot" folders, they will be automatically moved into the new workspace.
            </p>
            <button
              onClick={handleSetup}
              disabled={setting}
              className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {setting ? (
                <>
                  <CircleNotch className="h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <FolderOpen className="h-4 w-4" />
                  Set up Drive workspace
                </>
              )}
            </button>
          </div>

          {migrationResult && (migrationResult.resumes > 0 || migrationResult.coverLetters > 0) && (
            <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
              Migrated {migrationResult.resumes} resume(s) and {migrationResult.coverLetters} cover letter(s) from old folders.
            </div>
          )}
        </div>
      ) : (
        /* State 3: Configured */
        <div className="space-y-3">
          <div className="rounded-xl border border-green-200 bg-green-50/50 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-green-700">Workspace active</div>
                {rootUrl && (
                  <a
                    href={rootUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                  >
                    Open ai-job-bot folder <ArrowSquareOut className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-1.5 text-xs font-medium text-[var(--lagoon-deep)] hover:underline disabled:opacity-50"
                  title="Re-sync from Drive"
                >
                  <ArrowsClockwise className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  Sync
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
                >
                  <LinkBreak className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <a
                href={config.sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--sea-ink)] hover:border-[var(--lagoon)]/40"
              >
                <Table className="h-4 w-4 text-[var(--lagoon)]" />
                Job Tracking Sheet
                <ArrowSquareOut className="ml-auto h-3 w-3 text-[var(--sea-ink-soft)]" />
              </a>
              <a
                href={`https://drive.google.com/drive/folders/${config.resumesFolderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--sea-ink)] hover:border-[var(--lagoon)]/40"
              >
                <Folder className="h-4 w-4 text-[var(--lagoon)]" />
                Resumes
                <ArrowSquareOut className="ml-auto h-3 w-3 text-[var(--sea-ink-soft)]" />
              </a>
              <a
                href={`https://drive.google.com/drive/folders/${config.coverLettersFolderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--sea-ink)] hover:border-[var(--lagoon)]/40"
              >
                <Folder className="h-4 w-4 text-[var(--lagoon)]" />
                Cover Letters
                <ArrowSquareOut className="ml-auto h-3 w-3 text-[var(--sea-ink-soft)]" />
              </a>
            </div>

            {config.syncedAt && (
              <div className="mt-2 text-[10px] text-[var(--sea-ink-soft)]">
                Last synced: {new Date(config.syncedAt).toLocaleString()}
              </div>
            )}
          </div>

          {migrationResult && (migrationResult.resumes > 0 || migrationResult.coverLetters > 0) && (
            <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
              Migrated {migrationResult.resumes} resume(s) and {migrationResult.coverLetters} cover letter(s) from old folders.
            </div>
          )}

          {/* Advanced: manual sheet URL override */}
          <CollapsibleSection
            trigger={(open) => (
              <span className="text-xs text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]">
                {open ? 'Hide' : 'Advanced'}: Use a different sheet
              </span>
            )}
          >
            <div className="mt-2 flex gap-2">
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
              <button
                onClick={handleManualSheetSave}
                disabled={savingManual || !manualUrl.trim()}
                className="rounded-lg border border-[var(--lagoon)] px-3 py-2 text-xs font-medium text-[var(--lagoon-deep)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
              >
                {savingManual ? 'Saving...' : 'Override'}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-[var(--sea-ink-soft)]">
              This overrides the workspace sheet. Use <button onClick={async () => { await removeSheetsUrl(); setManualUrl('') }} className="underline">reset</button> to go back to the workspace default.
            </p>
          </CollapsibleSection>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}
    </section>
  )
}
