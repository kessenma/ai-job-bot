import { useCallback, useState } from 'react'
import {
  PencilSimple, CircleNotch, Copy, CheckCircle, ArrowSquareOut,
  Trash, CaretDown, CaretUp, GoogleDriveLogo, Link,
  Star, FunnelSimple, MapPin, Buildings,
  ArrowsOutSimple, ArrowsInSimple, FloppyDisk, FilePdf, Eye,
} from '@phosphor-icons/react'
import type { FileInfo } from '#/lib/uploads.server.ts'
import {
  generateAndSaveCoverLetter,
  saveCoverLetterToDrive,
  deleteGeneratedLetter,
  updateGeneratedLetter,
  exportCoverLetterPdf,
  scrapeJobForCoverLetter,
  type GeneratedCoverLetter,
  type ScrapeResult,
} from '#/lib/cover-letter-gen.api.ts'
import { useBotStream } from '#/hooks/useBotStream.ts'
import { BotViewerPanel } from '#/components/ui/BotViewerPanel.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog'

const SCRAPE_STREAM_URL = (sessionId: string) => `/api/pw-stream/stream/${sessionId}`

const SCRAPE_STAGE_LABELS: Record<string, string> = {
  navigating: 'Navigating to job posting...',
  page_loaded: 'Page loaded',
  challenge_waiting: 'Waiting for security check to resolve...',
  extracting: 'Extracting job description...',
  metadata: 'Reading job metadata...',
  parsing: 'Parsing content...',
  done: 'Scrape complete',
}

// --- PDF download helper ---
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

// --- Cover Letter Viewer Modal ---
function CoverLetterViewerModal({
  letter,
  open,
  onOpenChange,
  onUpdate,
  onSaveToDrive,
  onExportPdf,
  savingToDrive,
  exportingPdf,
}: {
  letter: GeneratedCoverLetter | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (id: number, content: string) => Promise<void>
  onSaveToDrive: (id: number) => void
  onExportPdf: (id: number) => void
  savingToDrive: number | null
  exportingPdf: number | null
}) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const startEdit = () => {
    if (letter) {
      setEditContent(letter.content)
      setEditing(true)
    }
  }

  const saveEdit = async () => {
    if (!letter) return
    setSaving(true)
    try {
      await onUpdate(letter.id, editContent)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    if (!letter) return
    await navigator.clipboard.writeText(editing ? editContent : letter.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setEditing(false); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilSimple className="h-5 w-5 text-[var(--lagoon)]" />
            {letter?.company} &mdash; {letter?.role}
          </DialogTitle>
          <DialogDescription>
            {letter && (
              <span className="flex items-center gap-3 text-xs">
                <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-bold uppercase">
                  {letter.style}
                </span>
                {letter.location && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {letter.location}
                  </span>
                )}
                <span>{new Date(letter.createdAt).toLocaleString()}</span>
                {letter.generationTimeS && <span>{letter.generationTimeS}s</span>}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Action bar */}
        <div className="flex items-center gap-2 border-b border-[var(--line)] pb-3">
          {!editing ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
            >
              <PencilSimple className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : (
            <button
              onClick={saveEdit}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-[var(--lagoon)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <FloppyDisk className="h-3.5 w-3.5" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          {editing && (
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
          >
            {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {letter && (
            <button
              onClick={() => onExportPdf(letter.id)}
              disabled={exportingPdf === letter.id}
              className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
            >
              {exportingPdf === letter.id ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <FilePdf className="h-3.5 w-3.5" />}
              Export PDF
            </button>
          )}
          <div className="flex-1" />
          {letter && !letter.driveUrl && (
            <button
              onClick={() => onSaveToDrive(letter.id)}
              disabled={savingToDrive === letter.id}
              className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
            >
              {savingToDrive === letter.id ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <GoogleDriveLogo className="h-3.5 w-3.5" />}
              Save to Drive
            </button>
          )}
          {letter?.driveUrl && (
            <a
              href={letter.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              <ArrowSquareOut className="h-3.5 w-3.5" />
              Open in Drive
            </a>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-auto">
          {editing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="h-full min-h-[50vh] w-full resize-none rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--sea-ink)] leading-relaxed focus:border-[var(--lagoon)] focus:outline-none"
            />
          ) : (
            <div className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--sea-ink)] leading-relaxed">
              {letter?.content}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Main Component ---

export function CoverLetterGenerator({
  initialHistory,
  availableSamples = [],
}: {
  initialHistory: GeneratedCoverLetter[]
  availableSamples?: FileInfo[]
}) {
  // URL + scrape state
  const [jobUrl, setJobUrl] = useState('')
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null)
  const [scrapeData, setScrapeData] = useState<ScrapeResult | null>(null)

  // Generation options
  const [style, setStyle] = useState<'classic' | 'modern'>('classic')
  const [sampleOverride, setSampleOverride] = useState(false)
  const [selectedSamples, setSelectedSamples] = useState<Set<string>>(new Set())

  // Flow state
  const [phase, setPhase] = useState<'idle' | 'scraping' | 'generating' | 'done'>('idle')
  const [result, setResult] = useState<(GeneratedCoverLetter & { uploadName?: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [savingToDrive, setSavingToDrive] = useState<number | null>(null)
  const [exportingPdf, setExportingPdf] = useState<number | null>(null)

  // Result editing
  const [editingResult, setEditingResult] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // History
  const [history, setHistory] = useState(initialHistory)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [viewingLetter, setViewingLetter] = useState<GeneratedCoverLetter | null>(null)

  // Bot stream
  const botStream = useBotStream(streamSessionId, SCRAPE_STREAM_URL)

  const favorites = availableSamples.filter((s) => s.isPrimary)
  const activeSamples = sampleOverride
    ? availableSamples.filter((s) => selectedSamples.has(s.name))
    : favorites.length > 0 ? favorites : availableSamples

  const isBusy = phase === 'scraping' || phase === 'generating'

  const handleGenerate = useCallback(async () => {
    if (!jobUrl.trim()) {
      setError('Please provide a job posting URL.')
      return
    }

    setError(null)
    setResult(null)
    setScrapeData(null)
    setStreamSessionId(null)
    setEditingResult(false)
    setExpanded(false)

    // --- Phase 1: Scrape ---
    setPhase('scraping')
    const sessionId = crypto.randomUUID()
    setStreamSessionId(sessionId)

    await new Promise((r) => setTimeout(r, 300))

    let scraped: ScrapeResult
    try {
      scraped = await scrapeJobForCoverLetter({ data: { url: jobUrl.trim(), sessionId } })
      setScrapeData(scraped)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scraping failed')
      setPhase('idle')
      return
    }

    const company = scraped.company || scraped.jobTitle?.split(' at ').pop() || 'Company'
    const role = scraped.jobTitle || 'Role'

    // --- Phase 2: Generate ---
    setPhase('generating')
    try {
      const letter = await generateAndSaveCoverLetter({
        data: {
          jobUrl: jobUrl.trim(),
          company,
          role,
          jobDescription: scraped.text,
          location: scraped.location || undefined,
          style,
          sampleNames: sampleOverride && selectedSamples.size > 0
            ? Array.from(selectedSamples)
            : undefined,
        },
      })
      setResult(letter)
      setHistory((prev) => [letter, ...prev])
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
      setPhase('idle')
    }
  }, [jobUrl, style, sampleOverride, selectedSamples])

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveToDrive = async (id: number, uploadName?: string) => {
    setSavingToDrive(id)
    try {
      const { docUrl } = await saveCoverLetterToDrive({ data: { id, uploadName } })
      setHistory((prev) =>
        prev.map((h) => (h.id === id ? { ...h, driveUrl: docUrl } : h)),
      )
      if (result?.id === id) {
        setResult((prev) => prev ? { ...prev, driveUrl: docUrl } : prev)
      }
      if (viewingLetter?.id === id) {
        setViewingLetter((prev) => prev ? { ...prev, driveUrl: docUrl } : prev)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save to Drive')
    } finally {
      setSavingToDrive(null)
    }
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

  const handleUpdateContent = async (id: number, content: string) => {
    const updated = await updateGeneratedLetter({ data: { id, content } })
    setHistory((prev) => prev.map((h) => (h.id === id ? { ...h, content } : h)))
    if (result?.id === id) setResult((prev) => prev ? { ...prev, content } : prev)
    if (viewingLetter?.id === id) setViewingLetter((prev) => prev ? { ...prev, content } : prev)
    return updated
  }

  const handleDelete = async (id: number) => {
    await deleteGeneratedLetter({ data: { id } })
    setHistory((prev) => prev.filter((h) => h.id !== id))
    if (result?.id === id) setResult(null)
  }

  const handleReset = () => {
    setPhase('idle')
    setResult(null)
    setScrapeData(null)
    setStreamSessionId(null)
    setJobUrl('')
    setError(null)
    setEditingResult(false)
    setExpanded(false)
  }

  const startResultEdit = () => {
    if (result) {
      setEditContent(result.content)
      setEditingResult(true)
      setExpanded(true)
    }
  }

  const saveResultEdit = async () => {
    if (!result) return
    setSavingEdit(true)
    try {
      await handleUpdateContent(result.id, editContent)
      setEditingResult(false)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <section className="island-shell mt-6 rounded-2xl p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        <PencilSimple className="h-5 w-5 text-[var(--lagoon)]" />
        Cover Letter Generator
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Paste a job URL — the bot will scrape the posting and generate a tailored cover letter.
      </p>

      {/* --- Input form --- */}
      <div className="space-y-3">
        <div className="relative">
          <Link className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sea-ink-soft)]" />
          <input
            type="url"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isBusy) handleGenerate() }}
            placeholder="Paste a job posting URL..."
            disabled={isBusy}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none disabled:opacity-50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--sea-ink-soft)] uppercase tracking-wider">Style</span>
            <div className="inline-flex rounded-lg border border-[var(--line)] p-0.5">
              {(['classic', 'modern'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  disabled={isBusy}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    style === s
                      ? 'bg-[var(--lagoon)] text-white'
                      : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
                  }`}
                >
                  {s === 'classic' ? 'Classic' : 'Modern'}
                </button>
              ))}
            </div>
          </div>

          {availableSamples.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!sampleOverride) setSelectedSamples(new Set(favorites.map((s) => s.name)))
                setSampleOverride(!sampleOverride)
              }}
              disabled={isBusy}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                sampleOverride
                  ? 'bg-[var(--lagoon)] text-white'
                  : 'border border-[var(--line)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
              }`}
            >
              <FunnelSimple className="h-3.5 w-3.5" />
              Samples ({activeSamples.length}/{availableSamples.length})
            </button>
          )}
        </div>

        {sampleOverride && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="space-y-1">
              {availableSamples.map((sample) => (
                <label key={sample.name} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-strong)]">
                  <input
                    type="checkbox"
                    checked={selectedSamples.has(sample.name)}
                    onChange={() => {
                      const next = new Set(selectedSamples)
                      if (next.has(sample.name)) next.delete(sample.name)
                      else next.add(sample.name)
                      setSelectedSamples(next)
                    }}
                    className="h-3.5 w-3.5 rounded border-[var(--line)] accent-[var(--lagoon)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[var(--sea-ink)]">{sample.originalName}</span>
                  {sample.isPrimary && <Star className="h-3 w-3 shrink-0 text-[var(--lagoon)]" weight="fill" />}
                </label>
              ))}
              {selectedSamples.size === 0 && (
                <p className="px-2 text-xs text-amber-600">Select at least one sample for best results.</p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isBusy || !jobUrl.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--lagoon)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {phase === 'scraping' ? (
            <><CircleNotch className="h-4 w-4 animate-spin" /> Scraping job posting...</>
          ) : phase === 'generating' ? (
            <><CircleNotch className="h-4 w-4 animate-spin" /> Generating cover letter...</>
          ) : (
            <><PencilSimple className="h-4 w-4" /> Scrape &amp; Generate</>
          )}
        </button>
      </div>

      {/* --- Bot Viewer --- */}
      {(phase === 'scraping' || botStream.done || botStream.logs.length > 0) && (
        <div className="mt-4">
          <BotViewerPanel stream={botStream} isSearching={phase === 'scraping'} title="Job Scraper" stageLabels={SCRAPE_STAGE_LABELS} />
        </div>
      )}

      {/* --- Scraped metadata --- */}
      {scrapeData && (phase === 'generating' || phase === 'done') && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          {scrapeData.company && (
            <div className="flex items-center gap-1.5 text-sm text-[var(--sea-ink)]">
              <Buildings className="h-4 w-4 text-[var(--sea-ink-soft)]" />
              <span className="font-medium">{scrapeData.company}</span>
            </div>
          )}
          {scrapeData.jobTitle && (
            <div className="flex items-center gap-1.5 text-sm text-[var(--sea-ink)]">
              <PencilSimple className="h-4 w-4 text-[var(--sea-ink-soft)]" />
              {scrapeData.jobTitle}
            </div>
          )}
          {scrapeData.location && (
            <div className="flex items-center gap-1.5 text-sm text-[var(--sea-ink-soft)]">
              <MapPin className="h-4 w-4" />
              {scrapeData.location}
            </div>
          )}
          <span className="text-xs text-[var(--sea-ink-soft)]">
            {scrapeData.text.length.toLocaleString()} chars scraped in {(scrapeData.timeMs / 1000).toFixed(1)}s
          </span>
        </div>
      )}

      {/* --- Generating indicator --- */}
      {phase === 'generating' && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--lagoon)]/30 bg-[var(--lagoon)]/5 px-4 py-4">
          <CircleNotch className="h-5 w-5 animate-spin text-[var(--lagoon)]" />
          <div>
            <div className="text-sm font-medium text-[var(--sea-ink)]">Generating cover letter with AI...</div>
            <div className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
              Using your resume, experience, and {activeSamples.length} sample{activeSamples.length !== 1 ? 's' : ''} as reference. This may take up to a minute.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* --- Result with inline editing --- */}
      {result && (
        <div className="mt-4 rounded-xl border border-[var(--lagoon)]/30 bg-[var(--lagoon)]/5 p-4">
          {/* Action bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--lagoon)]">
              Generated ({result.style}) &middot; {result.generationTimeS}s
            </div>
            <div className="flex-1" />
            {!editingResult ? (
              <button onClick={startResultEdit} className="flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)]">
                <PencilSimple className="h-3 w-3" /> Edit
              </button>
            ) : (
              <>
                <button onClick={saveResultEdit} disabled={savingEdit} className="flex items-center gap-1 rounded-full bg-[var(--lagoon)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                  {savingEdit ? <CircleNotch className="h-3 w-3 animate-spin" /> : <FloppyDisk className="h-3 w-3" />}
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditingResult(false)} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]">
                  Cancel
                </button>
              </>
            )}
            <button onClick={() => handleCopy(editingResult ? editContent : result.content)} className="flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)]">
              {copied ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={() => handleExportPdf(result.id)} disabled={exportingPdf === result.id} className="flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] disabled:opacity-50">
              {exportingPdf === result.id ? <CircleNotch className="h-3 w-3 animate-spin" /> : <FilePdf className="h-3 w-3" />}
              PDF
            </button>
            {!result.driveUrl && (
              <button onClick={() => handleSaveToDrive(result.id, result.uploadName)} disabled={savingToDrive === result.id} className="flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] disabled:opacity-50">
                {savingToDrive === result.id ? <CircleNotch className="h-3 w-3 animate-spin" /> : <GoogleDriveLogo className="h-3 w-3" />}
                Save to Drive
              </button>
            )}
            {result.driveUrl && (
              <a href={result.driveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100">
                <ArrowSquareOut className="h-3 w-3" /> Open in Drive
              </a>
            )}
            <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]" title={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <ArrowsInSimple className="h-3 w-3" /> : <ArrowsOutSimple className="h-3 w-3" />}
            </button>
            <button onClick={handleReset} className="flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)]">
              New
            </button>
          </div>

          {/* Content */}
          {editingResult ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className={`w-full resize-none rounded-lg border border-[var(--line)] bg-white p-4 text-sm text-[var(--sea-ink)] leading-relaxed focus:border-[var(--lagoon)] focus:outline-none ${
                expanded ? 'min-h-[60vh]' : 'min-h-[16rem]'
              }`}
            />
          ) : (
            <div className={`whitespace-pre-wrap text-sm text-[var(--sea-ink)] leading-relaxed ${
              expanded ? '' : 'max-h-60 overflow-y-auto'
            }`}>
              {result.content}
            </div>
          )}
        </div>
      )}

      {/* --- History --- */}
      {history.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-4 py-3 text-left text-sm font-medium text-[var(--sea-ink)] hover:bg-[var(--surface)]"
          >
            <span>History ({history.length})</span>
            {historyOpen ? <CaretUp className="h-4 w-4 text-[var(--sea-ink-soft)]" /> : <CaretDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />}
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-2">
              {history.map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--sea-ink)]">
                        {item.company} &mdash; {item.role}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
                        <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-bold uppercase">{item.style}</span>
                        {item.location && (
                          <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{item.location}</span>
                        )}
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        {item.driveUrl && (
                          <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[var(--lagoon-deep)] hover:underline">
                            <GoogleDriveLogo className="h-3 w-3" /> Drive
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setViewingLetter(item)} className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]" title="View & Edit">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleCopy(item.content)} className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]" title="Copy">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleExportPdf(item.id)} disabled={exportingPdf === item.id} className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)] disabled:opacity-50" title="Export PDF">
                        {exportingPdf === item.id ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <FilePdf className="h-3.5 w-3.5" />}
                      </button>
                      {!item.driveUrl && (
                        <button onClick={() => handleSaveToDrive(item.id)} disabled={savingToDrive === item.id} className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)] disabled:opacity-50" title="Save to Drive">
                          {savingToDrive === item.id ? <CircleNotch className="h-3.5 w-3.5 animate-spin" /> : <GoogleDriveLogo className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <button onClick={() => handleDelete(item.id)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50" title="Delete">
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- History viewer modal --- */}
      <CoverLetterViewerModal
        letter={viewingLetter}
        open={viewingLetter !== null}
        onOpenChange={(open) => { if (!open) setViewingLetter(null) }}
        onUpdate={async (id, content) => { await handleUpdateContent(id, content) }}
        onSaveToDrive={(id) => handleSaveToDrive(id)}
        onExportPdf={(id) => handleExportPdf(id)}
        savingToDrive={savingToDrive}
        exportingPdf={exportingPdf}
      />
    </section>
  )
}
