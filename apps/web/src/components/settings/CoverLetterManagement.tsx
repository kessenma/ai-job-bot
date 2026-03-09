import { useCallback, useRef, useState } from 'react'
import { FileText, Trash, CheckCircle, Circle } from '@phosphor-icons/react'
import { uploadCoverLetter, removeCoverLetter } from '#/lib/resume.api.ts'
import type { FileInfo } from '#/lib/uploads.server.ts'
import { DropZone } from '#/components/ui/index.ts'
import { fileToBase64 } from './fileToBase64.ts'
import { DocumentViewerModal, ViewButton } from './DocumentViewerModal.tsx'

export function CoverLetterManagement({
  coverLetters,
  onCoverLettersChange,
}: {
  coverLetters: FileInfo[]
  onCoverLettersChange: (cls: FileInfo[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewingFile, setViewingFile] = useState<FileInfo | null>(null)
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
                <div className="flex items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
                  <span>Uploaded {new Date(cl.uploadedAt).toLocaleDateString()}</span>
                  {cl.embedded === true ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                      <CheckCircle className="h-3 w-3" /> Embedded
                    </span>
                  ) : cl.embedded === false ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
                      <Circle className="h-3 w-3" /> Not embedded
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ViewButton onClick={() => setViewingFile(cl)} />
                <button
                  onClick={() => handleDelete(cl.name)}
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

      <DocumentViewerModal
        file={viewingFile}
        open={viewingFile !== null}
        onOpenChange={(open) => { if (!open) setViewingFile(null) }}
      />
    </section>
  )
}
