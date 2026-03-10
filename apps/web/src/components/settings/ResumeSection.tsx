import { useCallback, useRef, useState } from 'react'
import { FileArrowUp, FileDoc, Trash, CheckCircle, Circle } from '@phosphor-icons/react'
import { uploadResume, removeResume } from '#/lib/resume.api.ts'
import type { FileInfo } from '#/lib/uploads.server.ts'
import { DropZone } from '#/components/ui/index.ts'
import { fileToBase64 } from './fileToBase64.ts'
import { DocumentViewerModal, ViewButton } from './DocumentViewerModal.tsx'

export function ResumeSection({
  resume,
  onResumeChange,
}: {
  resume: FileInfo | null
  onResumeChange: (r: FileInfo | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
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
        <FileArrowUp className="h-5 w-5 text-[var(--lagoon)]" />
        Resume
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Upload your resume for auto-apply. Only the latest one is kept.
      </p>

      {resume ? (
        <div className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <FileDoc className="h-8 w-8 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[var(--sea-ink)]">{resume.originalName}</div>
            <div className="flex items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
              <span className="truncate">{resume.path}</span>
              {resume.embedded === true ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                  <CheckCircle className="h-3 w-3" /> Embedded
                </span>
              ) : resume.embedded === false ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
                  <Circle className="h-3 w-3" /> Not embedded
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ViewButton onClick={() => setViewerOpen(true)} />
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
            >
              <Trash className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
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

      <DocumentViewerModal
        file={resume}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
      />
    </section>
  )
}
