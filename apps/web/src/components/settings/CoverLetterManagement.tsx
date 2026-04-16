import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileText, Trash, CheckCircle, Circle, Star, CircleNotch,
  CloudArrowDown, GoogleDriveLogo, Link, TextAa,
  PencilSimple, Copy, MapPin, FilePdf, ArrowSquareOut,
} from '@phosphor-icons/react'
import {
  uploadCoverLetter, removeCoverLetter, setPrimaryCoverLetter,
  importCoverLetterFromDrive, importCoverLetterFromDocsUrl,
  uploadCoverLetterText, reEmbed, syncCoverLettersFromDrive,
} from '#/lib/resume.api.ts'
import {
  deleteGeneratedLetter, exportCoverLetterPdf, saveGeneratedAsSample,
  type GeneratedCoverLetter,
} from '#/lib/cover-letter-gen.api.ts'
import type { WorkspaceConfig } from '#/lib/drive-workspace.api.ts'
import type { FileInfo } from '#/lib/uploads.server.ts'
import { DropZone } from '#/components/ui/index.ts'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#/components/ui/tabs'
import { fileToBase64 } from './fileToBase64.ts'
import { DocumentViewerModal, ViewButton } from './DocumentViewerModal.tsx'
import { GoogleDrivePicker } from './GoogleDrivePicker.tsx'

function downloadBase64Pdf(base64: string, fileName: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function CoverLetterManagement({
  coverLetters,
  onCoverLettersChange,
  generatedLetters,
  onGeneratedLettersChange,
  workspaceConfig,
}: {
  coverLetters: FileInfo[]
  onCoverLettersChange: (cls: FileInfo[]) => void
  generatedLetters: GeneratedCoverLetter[]
  onGeneratedLettersChange: (letters: GeneratedCoverLetter[]) => void
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
  const [docsUrl, setDocsUrl] = useState('')
  const [importingDocs, setImportingDocs] = useState(false)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [savingText, setSavingText] = useState(false)
  const [inputMode, setInputMode] = useState<'file' | 'text' | 'docs-url'>('file')
  const [copied, setCopied] = useState<number | null>(null)
  const [exportingPdf, setExportingPdf] = useState<number | null>(null)
  const [savingAsSample, setSavingAsSample] = useState<number | null>(null)

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const result = await syncCoverLettersFromDrive()
      if (result.imported.length > 0) {
        onCoverLettersChange([...coverLetters, ...result.imported])
      }
      setSyncResult({ imported: result.imported.length, embedFailures: result.embedFailures })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [coverLetters, onCoverLettersChange])

  useEffect(() => {
    if (!workspaceConfig) return
    handleSync()
  }, [workspaceConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiles = useCallback(
    async (files: File[]) => {
      setError(null)
      const valid: File[] = []
      for (const file of files) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
        if (!['.pdf', '.doc', '.docx'].includes(ext)) {
          setError(`Skipped ${file.name} — invalid type. Allowed: PDF, DOC, DOCX`)
          continue
        }
        if (file.size > 10 * 1024 * 1024) {
          setError(`Skipped ${file.name} — too large. Max 10MB.`)
          continue
        }
        valid.push(file)
      }
      if (valid.length === 0) return
      setUploading(true)
      const uploaded: FileInfo[] = []
      try {
        for (const file of valid) {
          const base64 = await fileToBase64(file)
          const result = await uploadCoverLetter({ data: { fileName: file.name, base64Data: base64 } })
          uploaded.push(result)
        }
        onCoverLettersChange([...coverLetters, ...uploaded])
      } catch (e) {
        if (uploaded.length > 0) onCoverLettersChange([...coverLetters, ...uploaded])
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

  const handleToggleFavorite = useCallback(
    async (fileName: string) => {
      await setPrimaryCoverLetter({ data: { fileName } })
      onCoverLettersChange(
        coverLetters.map((cl) =>
          cl.name === fileName ? { ...cl, isPrimary: !cl.isPrimary } : cl,
        ),
      )
    },
    [coverLetters, onCoverLettersChange],
  )

  const handleCopy = async (text: string, id: number) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleExportPdf = async (id: number) => {
    setExportingPdf(id)
    try {
      const { pdfBase64, fileName } = await exportCoverLetterPdf({ data: { id } })
      downloadBase64Pdf(pdfBase64, fileName)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF export failed')
    } finally {
      setExportingPdf(null)
    }
  }

  const handleDeleteGenerated = async (id: number) => {
    await deleteGeneratedLetter({ data: { id } })
    onGeneratedLettersChange(generatedLetters.filter((l) => l.id !== id))
  }

  // Derive which generated letters are already saved as samples by matching originalName
  const savedOriginalNames = new Set(coverLetters.map((cl) => cl.originalName))
  const isGeneratedSaved = (letter: GeneratedCoverLetter) => {
    const expectedOriginal = `${letter.company} - ${letter.role}`.replace(/[^a-zA-Z0-9._-]/g, '_') + '.txt'
    return savedOriginalNames.has(expectedOriginal)
  }

  const handleSaveAsSample = async (id: number) => {
    const letter = generatedLetters.find((l) => l.id === id)
    if (letter && isGeneratedSaved(letter)) return
    setSavingAsSample(id)
    try {
      const file = await saveGeneratedAsSample({ data: { id } })
      onCoverLettersChange([...coverLetters, file as FileInfo])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save as sample')
    } finally {
      setSavingAsSample(null)
    }
  }

  return (
    <section className="mt-6 island-shell rounded-2xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
          <FileText className="h-5 w-5 text-[var(--lagoon)]" />
          Cover Letters
        </h2>
        {workspaceConfig && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] disabled:opacity-50"
          >
            {syncing ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <CloudArrowDown className="h-3.5 w-3.5" />}
            {syncing ? 'Syncing...' : 'Sync from Drive'}
          </button>
        )}
      </div>

      {syncResult && syncResult.imported > 0 && (
        <div className="mb-3 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Synced {syncResult.imported} new cover letter{syncResult.imported !== 1 ? 's' : ''} from Drive.
          {syncResult.embedFailures.length > 0 && (
            <span className="text-amber-600"> {syncResult.embedFailures.length} failed to embed.</span>
          )}
        </div>
      )}

      <Tabs defaultValue="samples">
        <TabsList variant="line" className="w-full justify-start mb-4">
          <TabsTrigger value="samples">
            Samples ({coverLetters.length})
          </TabsTrigger>
          <TabsTrigger value="generated">
            Generated ({generatedLetters.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════ SAMPLES TAB ═══════════════ */}
        <TabsContent value="samples">
          <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
            Upload previous cover letters so the AI can learn your writing style.
            Star your <strong>favorites</strong> — they'll be used as the default reference samples for generation.
          </p>

          {coverLetters.length > 0 && (
            <div className="mb-4 space-y-2">
              {coverLetters.map((cl) => (
                <div
                  key={cl.name}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    cl.isPrimary
                      ? 'border-[var(--lagoon)]/40 bg-[var(--lagoon)]/5'
                      : 'border-[var(--line)] bg-[var(--surface)]'
                  }`}
                >
                  <button
                    onClick={() => handleToggleFavorite(cl.name)}
                    className="shrink-0"
                    title={cl.isPrimary ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star
                      className={`h-5 w-5 transition ${cl.isPrimary ? 'text-[var(--lagoon)]' : 'text-[var(--sea-ink-soft)] hover:text-[var(--lagoon)]'}`}
                      weight={cl.isPrimary ? 'fill' : 'regular'}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--sea-ink)]">
                      {cl.originalName}
                      {cl.isPrimary && (
                        <span className="rounded-full bg-[var(--lagoon)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--lagoon)]">
                          Favorite
                        </span>
                      )}
                      {cl.originalName?.endsWith('.txt') && !cl.driveFileId && (
                        <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                          Generated
                        </span>
                      )}
                      {cl.driveFileId ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                          <GoogleDriveLogo className="h-2.5 w-2.5" /> Drive
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Local</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
                      <span>Uploaded {new Date(cl.uploadedAt).toLocaleDateString()}</span>
                      {cl.embedded === true ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                          <CheckCircle className="h-3 w-3" /> Embedded
                        </span>
                      ) : cl.embedded === false ? (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            setEmbedding(cl.name)
                            try {
                              await reEmbed({ data: { uploadName: cl.name } })
                              onCoverLettersChange(coverLetters.map((x) => x.name === cl.name ? { ...x, embedded: true } : x))
                            } catch {
                              setError('Embedding failed — is the LLM service running?')
                            } finally {
                              setEmbedding(null)
                            }
                          }}
                          disabled={embedding === cl.name}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 hover:bg-amber-100 hover:text-amber-700 transition"
                        >
                          {embedding === cl.name ? <CircleNotch className="h-3 w-3 animate-spin" /> : <Circle className="h-3 w-3" />}
                          {embedding === cl.name ? 'Embedding...' : 'Not embedded — click to embed'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ViewButton onClick={() => setViewingFile(cl)} />
                    <button
                      onClick={() => handleDelete(cl.name)}
                      className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
                    >
                      <Trash className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Input mode tabs */}
          <div className="mb-3 inline-flex rounded-lg border border-[var(--line)] p-0.5">
            {([
              { key: 'file' as const, label: 'Upload File', icon: FileText },
              { key: 'text' as const, label: 'Paste Text', icon: TextAa },
              { key: 'docs-url' as const, label: 'Google Docs URL', icon: Link },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setInputMode(key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  inputMode === key
                    ? 'bg-[var(--lagoon)] text-white'
                    : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {inputMode === 'file' && (
            <>
              <DropZone
                accept=".pdf,.doc,.docx"
                label={coverLetters.length === 0 ? 'Drop cover letter samples here or click to browse' : 'Add more cover letter samples'}
                hint="PDF, DOC, or DOCX up to 10MB — select multiple files"
                uploading={uploading}
                dragOver={dragOver}
                onDragOver={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onDrop={(file) => { setDragOver(false); handleFiles([file]) }}
                onClick={() => fileInputRef.current?.click()}
                inputRef={fileInputRef}
                onInputChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length > 0) handleFiles(files) }}
                compact={coverLetters.length > 0}
                multiple
              />
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
                        setError(null); setImporting(true)
                        try {
                          const result = await importCoverLetterFromDrive({ data: { fileId: file.id, fileName: file.name, mimeType: file.mimeType } })
                          onCoverLettersChange([...coverLetters, result])
                        } catch (e) { setError(e instanceof Error ? e.message : 'Import failed') }
                        finally { setImporting(false) }
                      }}
                    />
                    {importing && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
                        <CircleNotch className="h-4 w-4 animate-spin" /> Importing from Google Drive...
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {inputMode === 'text' && (
            <div className="space-y-3">
              <input type="text" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Sample title (e.g. 'Tech Startup Cover Letter')" className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none" />
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste your cover letter text here..." rows={8} className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none" />
              <button
                onClick={async () => {
                  if (!pasteText.trim()) { setError('Please enter cover letter text'); return }
                  setError(null); setSavingText(true)
                  try {
                    const result = await uploadCoverLetterText({ data: { title: pasteTitle.trim(), text: pasteText.trim() } })
                    onCoverLettersChange([...coverLetters, result])
                    setPasteTitle(''); setPasteText('')
                  } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save text sample') }
                  finally { setSavingText(false) }
                }}
                disabled={savingText || !pasteText.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--lagoon)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {savingText ? <CircleNotch className="h-4 w-4 animate-spin" /> : <TextAa className="h-4 w-4" />}
                {savingText ? 'Saving...' : 'Save as Sample'}
              </button>
            </div>
          )}

          {inputMode === 'docs-url' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input type="url" value={docsUrl} onChange={(e) => setDocsUrl(e.target.value)} placeholder="https://docs.google.com/document/d/..." className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none" />
                <button
                  onClick={async () => {
                    if (!docsUrl.includes('docs.google.com/document/d/')) { setError('Please enter a valid Google Docs URL'); return }
                    setError(null); setImportingDocs(true)
                    try {
                      const result = await importCoverLetterFromDocsUrl({ data: { docUrl: docsUrl } })
                      onCoverLettersChange([...coverLetters, result])
                      setDocsUrl('')
                    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed') }
                    finally { setImportingDocs(false) }
                  }}
                  disabled={importingDocs || !docsUrl.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {importingDocs ? <CircleNotch className="h-4 w-4 animate-spin" /> : <GoogleDriveLogo className="h-4 w-4" />}
                  {importingDocs ? 'Importing...' : 'Import'}
                </button>
              </div>
              <p className="text-xs text-[var(--sea-ink-soft)]">Paste a link to a Google Doc. The document will be imported as a PDF with extracted text for AI reference.</p>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════ GENERATED TAB ═══════════════ */}
        <TabsContent value="generated">
          <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
            Previously generated cover letters. Star any to add them as <strong>favorite samples</strong> for future generations.
          </p>

          {generatedLetters.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line)] py-10 text-center">
              <PencilSimple className="mb-2 h-8 w-8 text-[var(--sea-ink-soft)]" />
              <p className="text-sm text-[var(--sea-ink-soft)]">No generated cover letters yet.</p>
              <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">Use the Cover Letter Generator below to create one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {generatedLetters.map((letter) => {
                const isSaved = isGeneratedSaved(letter)
                return (
                  <div
                    key={letter.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      isSaved
                        ? 'border-[var(--lagoon)]/40 bg-[var(--lagoon)]/5'
                        : 'border-[var(--line)] bg-[var(--surface)]'
                    }`}
                  >
                    <button
                      onClick={() => handleSaveAsSample(letter.id)}
                      disabled={savingAsSample === letter.id || isSaved}
                      className="shrink-0"
                      title={isSaved ? 'Saved to samples' : 'Save as favorite sample'}
                    >
                      {savingAsSample === letter.id ? (
                        <CircleNotch className="h-5 w-5 animate-spin text-[var(--lagoon)]" />
                      ) : (
                        <Star
                          className={`h-5 w-5 transition ${isSaved ? 'text-[var(--lagoon)]' : 'text-[var(--sea-ink-soft)] hover:text-[var(--lagoon)]'}`}
                          weight={isSaved ? 'fill' : 'regular'}
                        />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-[var(--sea-ink)]">
                        {letter.company} &mdash; {letter.role}
                        {isSaved && (
                          <span className="rounded-full bg-[var(--lagoon)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--lagoon)]">
                            Saved
                          </span>
                        )}
                        <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-bold uppercase">
                          {letter.style}
                        </span>
                        {letter.driveUrl && (
                          <a
                            href={letter.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:underline"
                          >
                            <GoogleDriveLogo className="h-2.5 w-2.5" /> Drive
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
                        {letter.location && (
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {letter.location}
                          </span>
                        )}
                        <span>{new Date(letter.createdAt).toLocaleDateString()}</span>
                        {letter.modelUsed && <span>{letter.modelUsed}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(letter.content, letter.id)}
                        className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
                        title="Copy"
                      >
                        {copied === letter.id ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => handleExportPdf(letter.id)}
                        disabled={exportingPdf === letter.id}
                        className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
                        title="Export PDF"
                      >
                        {exportingPdf === letter.id ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <FilePdf className="h-3.5 w-3.5" />}
                      </button>
                      {letter.driveUrl && (
                        <a
                          href={letter.driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
                          title="Open in Drive"
                        >
                          <ArrowSquareOut className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteGenerated(letter.id)}
                        className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
                        title="Delete"
                      >
                        <Trash className="h-3 w-3" /> Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
