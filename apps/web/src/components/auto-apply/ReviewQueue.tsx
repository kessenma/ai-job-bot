import { useState } from 'react'
import {
  Queue, PaperPlaneTilt, CircleNotch, Funnel,
} from '@phosphor-icons/react'
import type { QueueItemWithScreenshot } from '#/lib/queue.api.ts'
import { markReviewed, submitApproved } from '#/lib/queue.api.ts'
import { QueueReviewCard } from './QueueReviewCard.tsx'

type StatusFilter = 'pending' | 'approved' | 'submitted' | 'failed' | 'expired' | 'rejected' | 'all'

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'failed', label: 'Failed' },
  { value: 'expired', label: 'Expired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

export function ReviewQueue({
  items: initialItems,
  onRefresh,
}: {
  items: QueueItemWithScreenshot[]
  onRefresh: () => void
}) {
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    submitted: number
    failed: number
    expired: number
    errors: string[]
  } | null>(null)

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter)
  const approvedSelected = [...selected].filter((id) => {
    const item = items.find((i) => i.id === id)
    return item?.status === 'approved'
  })

  const pendingCount = items.filter((i) => i.status === 'pending').length
  const approvedCount = items.filter((i) => i.status === 'approved').length

  const handleSelect = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(filtered.filter((i) => i.status === 'approved').map((i) => i.id)))
    } else {
      setSelected(new Set())
    }
  }

  const handleApprove = async (id: number) => {
    await markReviewed({ data: { id, action: 'approved' } })
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'approved', reviewedAt: new Date().toISOString() } : i)))
  }

  const handleReject = async (id: number) => {
    await markReviewed({ data: { id, action: 'rejected' } })
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'rejected', reviewedAt: new Date().toISOString() } : i)))
  }

  const handleSubmit = async () => {
    if (approvedSelected.length === 0) return
    setSubmitting(true)
    setSubmitResult(null)
    try {
      const result = await submitApproved({ data: { ids: approvedSelected } })
      setSubmitResult(result)
      // Update local state for submitted/failed/expired items
      setItems((prev) =>
        prev.map((i) => {
          if (!approvedSelected.includes(i.id)) return i
          // We don't know individual statuses from the batch result,
          // so refresh to get the actual state
          return i
        }),
      )
      setSelected(new Set())
      onRefresh()
    } catch (err) {
      setSubmitResult({
        submitted: 0,
        failed: approvedSelected.length,
        expired: 0,
        errors: [err instanceof Error ? err.message : 'Submit failed'],
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
          <Queue className="h-5 w-5 text-[var(--lagoon)]" />
          Review Queue
          {pendingCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
              {pendingCount} pending
            </span>
          )}
          {approvedCount > 0 && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
              {approvedCount} approved
            </span>
          )}
        </h2>
      </div>

      {/* Filter bar + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Funnel className="h-4 w-4 text-[var(--sea-ink-soft)]" />
          {FILTER_OPTIONS.map((opt) => {
            const count = opt.value === 'all' ? items.length : items.filter((i) => i.status === opt.value).length
            if (count === 0 && opt.value !== 'all' && opt.value !== filter) return null
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  filter === opt.value
                    ? 'bg-[var(--lagoon)] text-white'
                    : 'bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]'
                }`}
              >
                {opt.label} ({count})
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Select all (for approved items) */}
          {filtered.some((i) => i.status === 'approved') && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)]">
              <input
                type="checkbox"
                checked={approvedSelected.length > 0 && approvedSelected.length === filtered.filter((i) => i.status === 'approved').length}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[var(--lagoon)]"
              />
              Select all approved
            </label>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={approvedSelected.length === 0 || submitting}
            className="flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? (
              <CircleNotch className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PaperPlaneTilt className="h-3.5 w-3.5" />
            )}
            {submitting
              ? 'Submitting...'
              : `Apply (${approvedSelected.length})`}
          </button>
        </div>
      </div>

      {/* Submit result banner */}
      {submitResult && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          submitResult.failed > 0 || submitResult.expired > 0
            ? 'border-yellow-200 bg-yellow-50 text-yellow-800'
            : 'border-green-200 bg-green-50 text-green-800'
        }`}>
          {submitResult.submitted > 0 && <span>{submitResult.submitted} submitted. </span>}
          {submitResult.expired > 0 && <span>{submitResult.expired} expired. </span>}
          {submitResult.failed > 0 && <span>{submitResult.failed} failed. </span>}
          {submitResult.errors.length > 0 && (
            <div className="mt-1 text-xs">
              {submitResult.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Queue items */}
      {filtered.length === 0 ? (
        <div className="island-shell rounded-xl p-8 text-center">
          <Queue className="mx-auto mb-2 h-8 w-8 text-[var(--sea-ink-soft)]" />
          <p className="text-sm text-[var(--sea-ink-soft)]">
            {filter === 'pending'
              ? 'No applications pending review. Use "Dry Run" on jobs to queue them here.'
              : `No ${filter} items.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <QueueReviewCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onSelect={(checked) => handleSelect(item.id, checked)}
              onApprove={() => handleApprove(item.id)}
              onReject={() => handleReject(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
