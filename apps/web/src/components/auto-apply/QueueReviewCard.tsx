import { useState } from 'react'
import {
  CheckCircle, XCircle, ArrowSquareOut, Warning, Clock,
} from '@phosphor-icons/react'
import type { QueueItemWithScreenshot } from '#/lib/queue.api.ts'

type FilledField = { label: string; value: string; type: string }
type UnansweredQuestion = { label: string; type: string; options?: string[]; required: boolean }

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-gray-100 text-gray-500',
  submitted: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-600',
  expired: 'bg-yellow-100 text-yellow-700',
}

export function QueueReviewCard({
  item,
  selected,
  onSelect,
  onApprove,
  onReject,
}: {
  item: QueueItemWithScreenshot
  selected: boolean
  onSelect: (checked: boolean) => void
  onApprove: () => void
  onReject: () => void
}) {
  const [showScreenshot, setShowScreenshot] = useState(false)
  const filled: FilledField[] = JSON.parse(item.filledFields || '[]')
  const skipped: string[] = JSON.parse(item.skippedFields || '[]')
  const unanswered: UnansweredQuestion[] = JSON.parse(item.unansweredQuestions || '[]')
  const canSelect = item.status === 'approved'

  return (
    <div className="island-shell rounded-xl p-4">
      <div className="flex items-start gap-3">
        {/* Checkbox — only for approved items */}
        <div className="flex pt-1">
          <input
            type="checkbox"
            checked={selected}
            disabled={!canSelect}
            onChange={(e) => onSelect(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--line)] accent-[var(--lagoon)] disabled:opacity-30"
          />
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--sea-ink)]">{item.company}</span>
              {item.atsPlatform && (
                <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
                  {item.atsPlatform}
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[item.status] || ''}`}>
                {item.status}
              </span>
              {item.suitabilityScore != null && (
                <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-bold text-[var(--sea-ink-soft)]">
                  Score: {item.suitabilityScore}/10
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={item.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-medium text-[var(--lagoon-deep)] no-underline hover:bg-[var(--surface-strong)]"
              >
                <ArrowSquareOut className="h-3 w-3" />
                View
              </a>
            </div>
          </div>

          {item.role && (
            <div className="mt-0.5 text-sm text-[var(--sea-ink-soft)]">{item.role}</div>
          )}

          {/* Failure reason */}
          {item.failureReason && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <Warning className="h-4 w-4 shrink-0" />
              {item.failureReason}
            </div>
          )}

          {/* Fields summary */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Filled fields */}
            <div>
              <h4 className="mb-1 text-xs font-medium text-green-700">
                Filled ({filled.length})
              </h4>
              {filled.length === 0 ? (
                <p className="text-xs text-[var(--sea-ink-soft)]">No fields filled.</p>
              ) : (
                <div className="space-y-1">
                  {filled.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 font-bold uppercase text-green-700">
                        {f.type}
                      </span>
                      <span className="text-[var(--sea-ink-soft)]">{f.label}:</span>
                      <span className="font-medium text-[var(--sea-ink)]">{f.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Skipped + unanswered */}
            <div>
              {skipped.length > 0 && (
                <>
                  <h4 className="mb-1 text-xs font-medium text-yellow-700">
                    Skipped ({skipped.length})
                  </h4>
                  <div className="mb-2 space-y-1">
                    {skipped.map((label, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="inline-flex rounded-full bg-yellow-100 px-1.5 py-0.5 font-bold uppercase text-yellow-700">
                          skip
                        </span>
                        <span className="text-[var(--sea-ink)]">{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {unanswered.length > 0 && (
                <>
                  <h4 className="mb-1 text-xs font-medium text-red-600">
                    Unanswered ({unanswered.length})
                  </h4>
                  <div className="space-y-1">
                    {unanswered.map((q, i) => (
                      <div key={i} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                        {q.label} ({q.type}{q.required ? ', required' : ''})
                      </div>
                    ))}
                  </div>
                </>
              )}
              {skipped.length === 0 && unanswered.length === 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-medium text-yellow-700">Skipped (0)</h4>
                  <p className="text-xs text-[var(--sea-ink-soft)]">All fields handled.</p>
                </div>
              )}
            </div>
          </div>

          {/* Screenshot */}
          {item.screenshotImage && (
            <details className="mt-3" open={showScreenshot} onToggle={(e) => setShowScreenshot((e.target as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer text-xs text-[var(--lagoon)] hover:underline">
                {showScreenshot ? 'Hide screenshot' : 'View screenshot'}
              </summary>
              <img
                src={`data:image/png;base64,${item.screenshotImage}`}
                alt={`${item.company} form screenshot`}
                className="mt-2 max-h-64 rounded border border-[var(--line)] object-contain"
              />
            </details>
          )}

          {/* Actions */}
          {item.status === 'pending' && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={onApprove}
                className="flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
              >
                <CheckCircle className="h-3 w-3" />
                Approve
              </button>
              <button
                onClick={onReject}
                className="flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
              >
                <XCircle className="h-3 w-3" />
                Reject
              </button>
            </div>
          )}

          {/* Timestamps */}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--sea-ink-soft)]">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Queued {new Date(item.createdAt).toLocaleDateString()}
            </span>
            {item.stepsCompleted != null && (
              <span>{item.stepsCompleted} steps completed</span>
            )}
            {item.dryRunTimeMs != null && (
              <span>{(item.dryRunTimeMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
