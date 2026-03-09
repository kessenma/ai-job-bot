import { useCallback, useEffect, useState } from 'react'
import { FileText, CheckCircle, Circle, SpinnerGap, Eye } from '@phosphor-icons/react'
import { getDocumentDetails } from '#/lib/resume.api.ts'
import type { FileInfo } from '#/lib/uploads.server.ts'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '#/components/ui/tabs'
import { ScrollArea } from '#/components/ui/scroll-area'

type DocumentDetails = NonNullable<Awaited<ReturnType<typeof getDocumentDetails>>>

export function DocumentViewerModal({
  file,
  open,
  onOpenChange,
}: {
  file: FileInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [details, setDetails] = useState<DocumentDetails | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (uploadName: string) => {
    setLoading(true)
    try {
      const result = await getDocumentDetails({ data: { uploadName } })
      setDetails(result)
    } catch {
      setDetails(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && file) {
      load(file.name)
    } else {
      setDetails(null)
    }
  }, [open, file, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--lagoon)]" />
            {file?.originalName ?? 'Document'}
          </DialogTitle>
          <DialogDescription>
            {file && (
              <span className="flex items-center gap-3 text-xs">
                <span>Uploaded {new Date(file.uploadedAt).toLocaleDateString()}</span>
                {file.embedded === true ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 font-medium text-green-700">
                    <CheckCircle className="h-3 w-3" /> Embedded
                  </span>
                ) : file.embedded === false ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 font-medium text-gray-500">
                    <Circle className="h-3 w-3" /> Not embedded
                  </span>
                ) : null}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <SpinnerGap className="h-6 w-6 animate-spin text-[var(--lagoon)]" />
          </div>
        ) : details ? (
          <Tabs defaultValue="source" className="flex-1 min-h-0">
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="source">Source Document</TabsTrigger>
              <TabsTrigger value="text">Raw Text</TabsTrigger>
              <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
            </TabsList>

            <TabsContent value="source" className="mt-3 min-h-0">
              <ScrollArea className="h-[50vh]">
                <div className="space-y-4 pr-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoRow label="File Name" value={details.originalName} />
                    <InfoRow label="Stored As" value={details.name} />
                    <InfoRow
                      label="Uploaded"
                      value={new Date(details.uploadedAt).toLocaleString()}
                    />
                    <InfoRow
                      label="Text Extracted"
                      value={details.extractedText ? 'Yes' : 'No'}
                    />
                  </div>
                  {details.extractedText && (
                    <div>
                      <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                        Preview
                      </h4>
                      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                        <p className="line-clamp-6 whitespace-pre-wrap text-sm text-[var(--sea-ink)]">
                          {details.extractedText}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="text" className="mt-3 min-h-0">
              <ScrollArea className="h-[50vh]">
                {details.extractedText ? (
                  <pre className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 font-mono text-xs leading-relaxed text-[var(--sea-ink)]">
                    {details.extractedText}
                  </pre>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--sea-ink-soft)]">
                    <FileText className="mb-2 h-8 w-8" />
                    <p className="text-sm">No text could be extracted from this document.</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="embeddings" className="mt-3 min-h-0">
              <ScrollArea className="h-[50vh]">
                {details.embedding ? (
                  <div className="space-y-4 pr-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <InfoRow label="Model" value={details.embedding.model} />
                      <InfoRow
                        label="Dimensions"
                        value={String(details.embedding.dimensions)}
                      />
                      <InfoRow
                        label="Embedded At"
                        value={new Date(details.embedding.embeddedAt).toLocaleString()}
                      />
                    </div>
                    <div>
                      <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
                        Vector ({details.embedding.dimensions} dimensions)
                      </h4>
                      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                        <pre className="whitespace-pre-wrap font-mono text-[10px] leading-tight text-[var(--sea-ink-soft)]">
                          [{details.embedding.vector.map((v) => v.toFixed(6)).join(', ')}]
                        </pre>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--sea-ink-soft)]">
                    <Circle className="mb-2 h-8 w-8" />
                    <p className="text-sm">This document has not been embedded yet.</p>
                    <p className="mt-1 text-xs">
                      Embeddings are generated when the LLM service is available.
                    </p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--sea-ink-soft)]">
            <p className="text-sm">Document details not found.</p>
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

export function ViewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--line)] hover:text-[var(--sea-ink)]"
    >
      <Eye className="h-3 w-3" />
      View
    </button>
  )
}
