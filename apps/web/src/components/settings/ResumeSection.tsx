import { useCallback, useEffect, useRef, useState } from 'react'
import { FileArrowUp, Trash, CheckCircle, Circle, CircleNotch, Star, CloudArrowDown, GoogleDriveLogo } from '@phosphor-icons/react'
import { uploadResume, removeResume, setPrimaryResume, reEmbed, syncResumesFromDrive } from '#/lib/resume.api.ts'
import type { WorkspaceConfig } from '#/lib/drive-workspace.api.ts'
import type { FileInfo } from '#/lib/uploads.server.ts'
import { DropZone } from '#/components/ui/index.ts'
import { fileToBase64 } from './fileToBase64.ts'
import { DocumentViewerModal, ViewButton } from './DocumentViewerModal.tsx'
import { GoogleDrivePicker } from './GoogleDrivePicker.tsx'
import { importResumeFromDrive } from '#/lib/resume.api.ts'

export function ResumeSection({
  resumes,
  onResumesChange,
  workspaceConfig,
}: {
  resumes: FileInfo[]
  onResumesChange: (rs: FileInfo[]) => void
  workspaceConfig?: WorkspaceConfig | null
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewingFile, setViewingFile] = useState<FileInfo | null>(null)
  const [embedding, setEmbedding] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ imported: number; embedFailures: string[] } | null>(null)
  const [importing, setImporting] = useState(false)

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const result = await syncResumesFromDrive()
      if (result.imported.length > 0) {
        onResumesChange([...resumes, ...result.imported])
      }
      setSyncResult({ imported: result.imported.length, embedFailures: result.embedFailures })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [resumes, onResumesChange])

  // Auto-sync from Drive on mount when workspace is configured
  useEffect(() => {
    if (!workspaceConfig) return
    handleSync()
  }, [workspaceConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      if (!['.pdf', '.doc', '.docx'].includes(ext)) {
        setError('Invalid file type. Allowed: PDF, DOC, DOCX')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('File too large. Max 10MB.')
        return
      }
      setUploading(true)
      try {
        const base64 = await fileToBase64(file)
        const result = await uploadResume({ data: { fileName: file.name, base64Data: base64 } })
        onResumesChange([...resumes, result])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [resumes, onResumesChange],
  )

  const handleDelete = useCallback(
    async (fileName: string) => {
      await removeResume({ data: { fileName } })
      onResumesChange(resumes.filter((r) => r.name !== fileName))
    },
    [resumes, onResumesChange],
  )

  const handleSetPrimary = useCallback(
    async (fileName: string) => {
      await setPrimaryResume({ data: { fileName } })
      onResumesChange(
        resumes.map((r) => ({ ...r, isPrimary: r.name === fileName })),
      )
    },
    [resumes, onResumesChange],
  )

  return (
    <section className="island-shell rounded-2xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
          <FileArrowUp className="h-5 w-5 text-[var(--lagoon)]" />
          Resumes
        </h2>
        {workspaceConfig && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] disabled:opacity-50"
          >
            {syncing ? (
              <CircleNotch className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CloudArrowDown className="h-3.5 w-3.5" />
            )}
            {syncing ? 'Syncing...' : 'Sync from Drive'}
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Upload your resumes or sync from Google Drive.
        Mark one as the <strong>primary resume</strong> — it will be used by default for applications.
      </p>

      {syncResult && syncResult.imported > 0 && (
        <div className="mb-3 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Synced {syncResult.imported} new resume{syncResult.imported !== 1 ? 's' : ''} from Drive.
          {syncResult.embedFailures.length > 0 && (
            <span className="text-amber-600"> {syncResult.embedFailures.length} failed to embed.</span>
          )}
        </div>
      )}

      {resumes.length > 0 && (
        <div className="mb-4 space-y-2">
          {resumes.map((r) => (
            <div
              key={r.name}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                r.isPrimary
                  ? 'border-[var(--lagoon)]/40 bg-[var(--lagoon)]/5'
                  : 'border-[var(--line)] bg-[var(--surface)]'
              }`}
            >
              <button
                onClick={() => handleSetPrimary(r.name)}
                className="shrink-0"
                title={r.isPrimary ? 'Primary resume' : 'Set as primary resume'}
              >
                <Star
                  className={`h-5 w-5 transition ${
                    r.isPrimary
                      ? 'text-[var(--lagoon)]'
                      : 'text-[var(--sea-ink-soft)] hover:text-[var(--lagoon)]'
                  }`}
                  weight={r.isPrimary ? 'fill' : 'regular'}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--sea-ink)]">
                  {r.originalName}
                  {r.isPrimary && (
                    <span className="rounded-full bg-[var(--lagoon)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--lagoon)]">
                      Primary
                    </span>
                  )}
                  {r.driveFileId ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                      <GoogleDriveLogo className="h-2.5 w-2.5" /> Drive
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                      Local
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
                  <span>Uploaded {new Date(r.uploadedAt).toLocaleDateString()}</span>
                  {r.embedded === true ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                      <CheckCircle className="h-3 w-3" /> Embedded
                    </span>
                  ) : r.embedded === false ? (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        setEmbedding(r.name)
                        try {
                          await reEmbed({ data: { uploadName: r.name } })
                          onResumesChange(resumes.map((x) => x.name === r.name ? { ...x, embedded: true } : x))
                        } catch {
                          setError('Embedding failed — is the LLM service running?')
                        } finally {
                          setEmbedding(null)
                        }
                      }}
                      disabled={embedding === r.name}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 hover:bg-amber-100 hover:text-amber-700 transition"
                    >
                      {embedding === r.name ? (
                        <CircleNotch className="h-3 w-3 animate-spin" />
                      ) : (
                        <Circle className="h-3 w-3" />
                      )}
                      {embedding === r.name ? 'Embedding...' : 'Not embedded — click to embed'}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ViewButton onClick={() => setViewingFile(r)} />
                <button
                  onClick={() => handleDelete(r.name)}
                  className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
                >
                  <Trash className="h-3 w-3" />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DropZone
        accept=".pdf,.doc,.docx"
        label={
          resumes.length === 0
            ? 'Drop your resume here or click to browse'
            : 'Add another resume'
        }
        hint="PDF, DOC, or DOCX up to 10MB"
        uploading={uploading}
        dragOver={dragOver}
        onDragOver={() => setDragOver(true)}
        onDragLeave={() => setDragOver(false)}
        onDrop={(file) => {
          setDragOver(false)
          handleFile(file)
        }}
        onClick={() => fileInputRef.current?.click()}
        inputRef={fileInputRef}
        onInputChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
        compact={resumes.length > 0}
      />

      {/* Fallback: Google Drive Picker when no workspace configured */}
      {!workspaceConfig && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--line)]" />
            <span className="text-xs font-medium text-[var(--sea-ink-soft)]">or import from Google Drive</span>
            <div className="h-px flex-1 bg-[var(--line)]" />
          </div>
          <div className="mt-3">
            <GoogleDrivePicker
              disabled={importing}
              onSelect={async (file) => {
                setError(null)
                setImporting(true)
                try {
                  const result = await importResumeFromDrive({
                    data: { fileId: file.id, fileName: file.name, mimeType: file.mimeType },
                  })
                  onResumesChange([...resumes, result])
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Import failed')
                } finally {
                  setImporting(false)
                }
              }}
            />
            {importing && (
              <div className="mt-2 flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
                <CircleNotch className="h-4 w-4 animate-spin" />
                Importing from Google Drive...
              </div>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      <DocumentViewerModal
        file={viewingFile}
        open={viewingFile !== null}
        onOpenChange={(open) => { if (!open) setViewingFile(null) }}
      />
    </section>
  )
}
