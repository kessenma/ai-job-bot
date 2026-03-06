import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import {
  FileUp, Trash2, FileCheck, FileText, Settings as SettingsIcon, PenLine,
  Mail, Table, ExternalLink, CheckCircle, XCircle, Inbox,
} from 'lucide-react'
import {
  getResume, uploadResume, removeResume,
  getCoverLetters, uploadCoverLetter, removeCoverLetter,
} from '#/lib/resume.api.ts'
import { getGmailStatus } from '#/lib/gmail.api.ts'
import { getSheetsStatus } from '#/lib/sheets.api.ts'
import type { FileInfo } from '#/lib/uploads.server.ts'
import { DropZone } from '#/components/ui/index.ts'
import { requireAuth } from '#/lib/auth-guard.ts'

export const Route = createFileRoute('/settings')({
  beforeLoad: requireAuth,
  loader: async () => {
    const [resume, coverLetters, gmailStatus, sheetsStatus] = await Promise.all([
      getResume(),
      getCoverLetters(),
      getGmailStatus(),
      getSheetsStatus(),
    ])
    return { resume, coverLetters, gmailStatus, sheetsStatus }
  },
  component: Settings,
})

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]!)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function Settings() {
  const { resume: initialResume, coverLetters: initialCoverLetters, gmailStatus, sheetsStatus } = Route.useLoaderData()
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
            <Mail className="h-5 w-5 shrink-0 text-[var(--lagoon)]" />
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
              <Inbox className="mr-1 inline h-3 w-3" />
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
                  {sheetsStatus.sheetUrl} <ExternalLink className="mb-0.5 inline h-3 w-3" />
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
      <CoverLettersSection coverLetters={coverLetters} onCoverLettersChange={setCoverLetters} />

      {/* Future: LLM Config */}
      <section className="mt-6 island-shell rounded-2xl p-6 opacity-60">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
          <PenLine className="h-5 w-5 text-[var(--lagoon)]" />
          Cover Letter AI (Coming Soon)
        </h2>
        <p className="text-sm text-[var(--sea-ink-soft)]">
          An on-prem LLM will use your uploaded cover letter samples to learn your writing style
          and generate tailored cover letters for each application. Connect to your local LLM
          server (Ollama, llama.cpp, etc.) running in a separate Docker container.
        </p>
      </section>
    </main>
  )
}

function ResumeSection({
  resume,
  onResumeChange,
}: {
  resume: FileInfo | null
  onResumeChange: (r: FileInfo | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        onResumeChange(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [onResumeChange],
  )

  const handleDelete = useCallback(async () => {
    await removeResume()
    onResumeChange(null)
  }, [onResumeChange])

  return (
    <section className="island-shell rounded-2xl p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        <FileUp className="h-5 w-5 text-[var(--lagoon)]" />
        Resume
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Upload your resume for auto-apply. Only the latest one is kept.
      </p>

      {resume ? (
        <div className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <FileCheck className="h-8 w-8 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[var(--sea-ink)]">{resume.originalName}</div>
            <div className="truncate text-xs text-[var(--sea-ink-soft)]">{resume.path}</div>
          </div>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      ) : (
        <DropZone
          accept=".pdf,.doc,.docx"
          label="Drop your resume here or click to browse"
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
        />
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}
    </section>
  )
}

function CoverLettersSection({
  coverLetters,
  onCoverLettersChange,
}: {
  coverLetters: FileInfo[]
  onCoverLettersChange: (cls: FileInfo[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        const result = await uploadCoverLetter({ data: { fileName: file.name, base64Data: base64 } })
        onCoverLettersChange([...coverLetters, result])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [coverLetters, onCoverLettersChange],
  )

  const handleDelete = useCallback(
    async (fileName: string) => {
      await removeCoverLetter({ data: { fileName } })
      onCoverLettersChange(coverLetters.filter((cl) => cl.name !== fileName))
    },
    [coverLetters, onCoverLettersChange],
  )

  return (
    <section className="mt-6 island-shell rounded-2xl p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        <FileText className="h-5 w-5 text-[var(--lagoon)]" />
        Cover Letter Samples
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Upload previous cover letters so the AI can learn your writing style.
        The more samples, the better it can mimic your voice.
      </p>

      {coverLetters.length > 0 && (
        <div className="mb-4 space-y-2">
          {coverLetters.map((cl) => (
            <div
              key={cl.name}
              className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3"
            >
              <FileText className="h-5 w-5 shrink-0 text-[var(--lagoon)]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--sea-ink)]">{cl.originalName}</div>
                <div className="text-xs text-[var(--sea-ink-soft)]">
                  Uploaded {new Date(cl.uploadedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => handleDelete(cl.name)}
                className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <DropZone
        accept=".pdf,.doc,.docx"
        label={
          coverLetters.length === 0
            ? 'Drop cover letter samples here or click to browse'
            : 'Add another cover letter sample'
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
        compact={coverLetters.length > 0}
      />

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}
    </section>
  )
}

