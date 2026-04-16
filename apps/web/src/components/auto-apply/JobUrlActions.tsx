import { useState, useCallback } from 'react'
import {
  MagnifyingGlass, CircleNotch, Warning, Robot, Play,
  CheckCircle, XCircle, Sparkle,
} from '@phosphor-icons/react'
import {
  screenshotUrl, fillForm,
  type ApplyProfile, type FillFormResult,
} from '#/lib/playwright.api.ts'
import { queueDryRun, markReviewed, type QueueItem } from '#/lib/queue.api.ts'
import { answerFormFields, type FormFieldSuggestion } from '#/lib/llm.api.ts'
import { useBotStream } from '#/hooks/useBotStream.ts'
import { BotViewerPanel } from '#/components/ui/BotViewerPanel.tsx'

const STREAM_URL = (sessionId: string) => `/api/pw-stream/stream/${sessionId}`

const STAGE_LABELS: Record<string, string> = {
  navigating: 'Navigating to page...',
  page_loaded: 'Page loaded',
  interacting: 'Dismissing popups...',
  clicked_apply: 'Clicked apply button',
  filling: 'Filling form fields...',
  filled: 'Form filled — review below',
  capturing: 'Taking screenshot...',
  done: 'Complete',
}

interface JobUrlActionsProps {
  profile: ApplyProfile | null
  onFillResult: (result: FillFormResult) => void
}

type FilledField = { label: string; value: string; type: string }
type SkippedField = { label: string; type: string; required: boolean; options?: string[]; selector?: string }
type UnansweredQuestion = { label: string; type: string; options?: string[]; required: boolean }

interface DryRunResult {
  item: QueueItem
  filled: FilledField[]
  skipped: SkippedField[]
  unanswered: UnansweredQuestion[]
}

export function JobUrlActions({ profile, onFillResult }: JobUrlActionsProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState<'screenshot' | 'fill' | 'dryrun' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | null>(null)
  const [skippedEdits, setSkippedEdits] = useState<Record<number, string>>({})
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<FormFieldSuggestion[]>([])

  const stream = useBotStream(sessionId, STREAM_URL)

  const resetState = () => {
    setError(null)
    setDryRunResult(null)
    setReviewAction(null)
    setSkippedEdits({})
    setAiSuggestions([])
  }

  const handleScreenshot = useCallback(async () => {
    if (!url.trim()) return
    setLoading('screenshot')
    resetState()
    const sid = crypto.randomUUID()
    setSessionId(sid)
    try {
      await screenshotUrl({ data: { url: url.trim(), sessionId: sid } })
      setUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to take screenshot')
    } finally {
      setLoading(null)
    }
  }, [url])

  const handleFillForm = useCallback(async () => {
    if (!url.trim()) return
    if (!profile) {
      setError('Please save your profile first before filling forms.')
      return
    }
    setLoading('fill')
    resetState()
    const sid = crypto.randomUUID()
    setSessionId(sid)
    try {
      const result = await fillForm({ data: { url: url.trim(), sessionId: sid } })
      onFillResult(result)
      setUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fill form')
    } finally {
      setLoading(null)
    }
  }, [url, profile, onFillResult])

  const handleDryRun = useCallback(async () => {
    if (!url.trim()) return
    if (!profile) {
      setError('Please save your profile first before running a dry run.')
      return
    }
    setLoading('dryrun')
    resetState()
    const sid = crypto.randomUUID()
    setSessionId(sid)
    const jobUrl = url.trim()
    try {
      const item = await queueDryRun({ data: { jobUrl, company: 'Unknown', sessionId: sid } })
      setDryRunResult({
        item,
        filled: JSON.parse(item.filledFields || '[]'),
        skipped: JSON.parse(item.skippedFields || '[]'),
        unanswered: JSON.parse(item.unansweredQuestions || '[]'),
      })
      setUrl('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dry run failed'
      setError(msg)
      console.error('Dry run failed:', err)
    } finally {
      setLoading(null)
    }
  }, [url, profile])

  const handleApprove = useCallback(async () => {
    if (!dryRunResult) return
    // Build edits from user-filled skipped fields
    const edits = Object.entries(skippedEdits)
      .filter(([, value]) => value.trim())
      .map(([idx, value]) => ({
        label: dryRunResult.skipped[Number(idx)]?.label || `field_${idx}`,
        originalValue: '',
        newValue: value,
      }))
    try {
      await markReviewed({ data: { id: dryRunResult.item.id, action: 'approved', edits: edits.length > 0 ? edits : undefined } })
      setReviewAction('approved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    }
  }, [dryRunResult, skippedEdits])

  const handleReject = useCallback(async () => {
    if (!dryRunResult) return
    try {
      await markReviewed({ data: { id: dryRunResult.item.id, action: 'rejected' } })
      setReviewAction('rejected')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject')
    }
  }, [dryRunResult])

  const handleAiSuggest = useCallback(async () => {
    if (!dryRunResult || dryRunResult.skipped.length === 0) return
    setAiSuggesting(true)
    setError(null)
    try {
      const { answers } = await answerFormFields({
        data: {
          formFields: dryRunResult.skipped.map((f) => ({
            label: f.label,
            type: f.type,
            required: f.required,
            options: f.options,
          })),
          company: dryRunResult.item.company || undefined,
          role: dryRunResult.item.role || undefined,
        },
      })
      setAiSuggestions(answers)
      // Auto-fill the skipped edits with suggestions
      const newEdits: Record<number, string> = { ...skippedEdits }
      for (const answer of answers) {
        const idx = dryRunResult.skipped.findIndex((f) => f.label === answer.label)
        if (idx >= 0 && !newEdits[idx]) {
          newEdits[idx] = answer.suggestedValue
        }
      }
      setSkippedEdits(newEdits)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI suggestion failed')
    } finally {
      setAiSuggesting(false)
    }
  }, [dryRunResult, skippedEdits])

  const isActive = loading === 'screenshot' || loading === 'fill' || loading === 'dryrun'
  const viewerTitle = loading === 'dryrun' || dryRunResult
    ? 'Dry Run'
    : loading === 'fill'
      ? 'Fill Form'
      : 'Screenshot'

  return (
    <>
      <section className="island-shell mb-8 rounded-xl p-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
          <MagnifyingGlass className="h-5 w-5 text-[var(--lagoon)]" />
          Job URL
        </h2>
        <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
          Enter a job URL to screenshot, fill, or dry-run the application form.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleScreenshot()}
            placeholder="https://jobs.example.com/apply/12345"
            disabled={!!loading}
            className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleScreenshot}
            disabled={!!loading || !url.trim()}
            className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--sea-ink)] hover:bg-[var(--surface-strong)] disabled:pointer-events-none disabled:opacity-50"
          >
            {loading === 'screenshot' ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <MagnifyingGlass className="h-4 w-4" />
            )}
            {loading === 'screenshot' ? 'Capturing...' : 'Screenshot'}
          </button>
          <button
            onClick={handleFillForm}
            disabled={!!loading || !url.trim() || !profile}
            title={!profile ? 'Save your profile first' : undefined}
            className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading === 'fill' ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <Robot className="h-4 w-4" />
            )}
            {loading === 'fill' ? 'Filling...' : 'Fill Form'}
          </button>
          <button
            onClick={handleDryRun}
            disabled={!!loading || !url.trim() || !profile}
            title={!profile ? 'Save your profile first' : undefined}
            className="flex items-center gap-2 rounded-lg border-2 border-[var(--lagoon)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--lagoon)] hover:bg-[var(--surface-strong)] disabled:pointer-events-none disabled:opacity-50"
          >
            {loading === 'dryrun' ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {loading === 'dryrun' ? 'Running...' : 'Dry Run'}
          </button>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            <Warning className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </section>

      {/* Bot viewer — streams live for all actions, includes dry run review when done */}
      <BotViewerPanel
        stream={stream}
        isSearching={isActive}
        stageLabels={STAGE_LABELS}
        title={viewerTitle}
      >
        {/* Dry run review appears inside the viewer once complete */}
        {dryRunResult && (
          <div className="mt-4 border-t border-[var(--line)] pt-4">
            {/* Fields summary */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1.5 text-xs font-medium text-green-700">
                  Filled ({dryRunResult.filled.length})
                </h4>
                {dryRunResult.filled.length === 0 ? (
                  <p className="text-xs text-[var(--sea-ink-soft)]">No fields filled.</p>
                ) : (
                  <div className="space-y-1">
                    {dryRunResult.filled.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="inline-flex shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 font-bold uppercase text-green-700">
                          {f.type}
                        </span>
                        <span className="text-[var(--sea-ink-soft)]">{f.label}:</span>
                        <span className="font-medium text-[var(--sea-ink)]">{f.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                {dryRunResult.skipped.length > 0 && (
                  <>
                    <div className="mb-1.5 flex items-center justify-between">
                      <h4 className="text-xs font-medium text-yellow-700">
                        Skipped ({dryRunResult.skipped.length})
                      </h4>
                      <button
                        onClick={handleAiSuggest}
                        disabled={aiSuggesting}
                        className="flex items-center gap-1 rounded-full bg-purple-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                      >
                        {aiSuggesting ? (
                          <CircleNotch className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkle className="h-3 w-3" />
                        )}
                        {aiSuggesting ? 'Thinking...' : 'AI Suggest'}
                      </button>
                    </div>
                    <div className="mb-2 space-y-2">
                      {dryRunResult.skipped.map((field, i) => {
                        const suggestion = aiSuggestions.find((s) => s.label === field.label)
                        const editValue = skippedEdits[i] ?? ''
                        return (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="mt-1 inline-flex shrink-0 rounded-full bg-yellow-100 px-1.5 py-0.5 font-bold uppercase text-yellow-700">
                              {field.type === 'select' ? 'select' : 'skip'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="text-[var(--sea-ink)]">{field.label}</span>
                              {suggestion && (
                                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                  suggestion.confidence === 'high' ? 'bg-green-100 text-green-700' :
                                  suggestion.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-600'
                                }`}>
                                  {suggestion.confidence}
                                </span>
                              )}
                              {field.options && field.options.length > 0 ? (
                                <select
                                  className="mt-1 block w-full rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--sea-ink)]"
                                  value={editValue}
                                  onChange={(e) => {
                                    setSkippedEdits((prev) => ({ ...prev, [i]: e.target.value }))
                                  }}
                                >
                                  <option value="">Select...</option>
                                  {field.options.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={editValue}
                                  placeholder={`Enter ${field.label.replace(/\*$/, '').trim()}...`}
                                  className="mt-1 block w-full rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)]"
                                  onChange={(e) => {
                                    setSkippedEdits((prev) => ({ ...prev, [i]: e.target.value }))
                                  }}
                                />
                              )}
                              {suggestion?.reasoning && (
                                <p className="mt-0.5 text-[10px] text-[var(--sea-ink-soft)]">{suggestion.reasoning}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {dryRunResult.unanswered.length > 0 && (
                  <>
                    <h4 className="mb-1.5 text-xs font-medium text-red-600">
                      Unanswered ({dryRunResult.unanswered.length})
                    </h4>
                    <div className="space-y-1">
                      {dryRunResult.unanswered.map((q, i) => (
                        <div key={i} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                          {q.label} ({q.type}{q.required ? ', required' : ''})
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {dryRunResult.skipped.length === 0 && dryRunResult.unanswered.length === 0 && (
                  <p className="text-xs text-[var(--sea-ink-soft)]">All fields handled.</p>
                )}
              </div>
            </div>

            {/* Full-page screenshot of pre-filled form */}
            {stream.latestScreenshot && (
              <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)]">
                <div className="max-h-96 overflow-y-auto">
                  <img
                    src={`data:image/png;base64,${stream.latestScreenshot}`}
                    alt="Pre-filled form"
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Approve / Reject */}
            {!reviewAction ? (
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleApprove}
                  className="flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve &amp; Queue
                </button>
                <button
                  onClick={handleReject}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--line)] px-4 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
              </div>
            ) : (
              <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                reviewAction === 'approved'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-gray-50 text-gray-500'
              }`}>
                {reviewAction === 'approved' ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Approved — queued for submission in the Review tab.
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Rejected.
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </BotViewerPanel>
    </>
  )
}
