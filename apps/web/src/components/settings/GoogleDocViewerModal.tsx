import { useCallback, useEffect, useRef, useState } from 'react'
import { FileDoc, ArrowSquareOut, SpinnerGap, Circle } from '@phosphor-icons/react'
import type { DriveFile } from '#/lib/drive-workspace.api.ts'
import { getDriveFilePreview, getDocumentDetails } from '#/lib/resume.api.ts'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#/components/ui/tabs'
import { ScrollArea } from '#/components/ui/scroll-area'

type PreviewData = NonNullable<Awaited<ReturnType<typeof getDriveFilePreview>>>
type DocumentDetails = NonNullable<Awaited<ReturnType<typeof getDocumentDetails>>>

// Module-level cache so re-opening the same file doesn't re-fetch
const previewCache = new Map<string, PreviewData>()

function getOpenUrl(file: DriveFile): string {
  if (file.webViewLink) return file.webViewLink
  if (file.mimeType === 'application/vnd.google-apps.document') {
    return `https://docs.google.com/document/d/${file.id}/edit`
  }
  return `https://drive.google.com/file/d/${file.id}/view`
}

export function GoogleDocViewerModal({
  file,
  open,
  onOpenChange,
}: {
  file: DriveFile | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [embeddingDetails, setEmbeddingDetails] = useState<DocumentDetails | null>(null)
  const loadedFileId = useRef<string | null>(null)

  const lookupEmbedding = useCallback(async (f: DriveFile) => {
    const uploadName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const variants = [uploadName, `${uploadName}.pdf`]
    for (const name of variants) {
      try {
        const details = await getDocumentDetails({ data: { uploadName: name } })
        if (details) {
          setEmbeddingDetails(details)
          return
        }
      } catch { /* not imported yet */ }
    }
    setEmbeddingDetails(null)
  }, [])

  const load = useCallback(async (f: DriveFile) => {
    // Use cached preview if available
    const cached = previewCache.get(f.id)
    if (cached) {
      setPreview(cached)
      setLoading(false)
      lookupEmbedding(f)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await getDriveFilePreview({ data: { fileId: f.id, mimeType: f.mimeType } })
      setPreview(result)
      previewCache.set(f.id, result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load preview')
      setPreview(null)
    } finally {
      setLoading(false)
    }

    lookupEmbedding(f)
  }, [lookupEmbedding])

  useEffect(() => {
    if (open && file) {
      if (loadedFileId.current !== file.id) {
        loadedFileId.current = file.id
        load(file)
      }
    } else if (!open) {
      loadedFileId.current = null
      setPreview(null)
      setError(null)
      setEmbeddingDetails(null)
    }
  }, [open, file, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDoc className="h-5 w-5 text-[var(--lagoon)]" />
            <span className="min-w-0 truncate">{file?.name ?? 'Document'}</span>
          </DialogTitle>
          <DialogDescription>
            {file && (
              <span className="flex items-center gap-3 text-xs">
                <span>Modified {new Date(file.modifiedTime).toLocaleDateString()}</span>
                <a
                  href={getOpenUrl(file)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--lagoon)]/10 px-2 py-0.5 font-medium text-[var(--lagoon-deep)] hover:bg-[var(--lagoon)]/20 transition"
                >
                  <ArrowSquareOut className="h-3 w-3" />
                  Open in Google Docs
                </a>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <SpinnerGap className="h-6 w-6 animate-spin text-[var(--lagoon)]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--sea-ink-soft)]">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : preview ? (
          <Tabs defaultValue="formatted" className="flex-1 min-h-0">
            <TabsList variant="line" className="w-full justify-start">
              {preview.html && <TabsTrigger value="formatted">Formatted</TabsTrigger>}
              {preview.text && <TabsTrigger value="text">Plain Text</TabsTrigger>}
              <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
            </TabsList>

            {preview.html && (
              <TabsContent value="formatted" className="mt-3 min-h-0">
                <ScrollArea className="h-[60vh]">
                  <div
                    className="prose prose-sm max-w-none rounded-lg border border-[var(--line)] bg-white p-4"
                    dangerouslySetInnerHTML={{ __html: preview.html }}
                  />
                </ScrollArea>
              </TabsContent>
            )}

            {preview.text && (
              <TabsContent value="text" className="mt-3 min-h-0">
                <ScrollArea className="h-[60vh]">
                  <pre className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 font-mono text-xs leading-relaxed text-[var(--sea-ink)]">
                    {preview.text}
                  </pre>
                </ScrollArea>
              </TabsContent>
            )}

            <TabsContent value="embeddings" className="mt-3 min-h-0">
              <ScrollArea className="h-[60vh]">
                {embeddingDetails?.embedding ? (
                  <div className="space-y-4 pr-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <InfoRow label="Model" value={embeddingDetails.embedding.model} />
                      <InfoRow label="Dimensions" value={String(embeddingDetails.embedding.dimensions)} />
                      <InfoRow label="Embedded At" value={new Date(embeddingDetails.embedding.embeddedAt).toLocaleString()} />
                    </div>
                    <div>
                      <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                        Vector ({embeddingDetails.embedding.dimensions} dimensions)
                      </h4>
                      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                        <pre className="whitespace-pre-wrap font-mono text-[10px] leading-tight text-[var(--sea-ink-soft)]">
                          [{embeddingDetails.embedding.vector.map((v) => v.toFixed(6)).join(', ')}]
                        </pre>
                      </div>
                    </div>
                  </div>
                ) : embeddingDetails && !embeddingDetails.embedding ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--sea-ink-soft)]">
                    <Circle className="mb-2 h-8 w-8" />
                    <p className="text-sm">This document has been imported but not yet embedded.</p>
                    <p className="mt-1 text-xs">
                      Embeddings are generated when the LLM service is available.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--sea-ink-soft)]">
                    <Circle className="mb-2 h-8 w-8" />
                    <p className="text-sm">This file hasn't been imported yet.</p>
                    <p className="mt-1 text-xs">
                      Use the Import button in the file list to import and embed this document.
                    </p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--sea-ink-soft)]">
            <FileDoc className="mb-2 h-8 w-8" />
            <p className="text-sm">Preview not available for this file type.</p>
            {file && (
              <a
                href={getOpenUrl(file)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[var(--lagoon)] hover:underline"
              >
                <ArrowSquareOut className="h-4 w-4" />
                Open in Google Drive
              </a>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--sea-ink-soft)]">{label}</dt>
      <dd className="mt-0.5 truncate text-[var(--sea-ink)]">{value}</dd>
    </div>
  )
}

export function DriveViewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--line)] hover:text-[var(--sea-ink)]"
    >
      <FileDoc className="h-3 w-3" />
      View
    </button>
  )
}
