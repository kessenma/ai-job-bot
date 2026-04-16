import { useState } from 'react'
import {
  Warning, XCircle, Trash, CaretDown, CaretRight,
  Image, Funnel,
} from '@phosphor-icons/react'
import type { ApplyErrorWithScreenshot } from '#/lib/error-log.api.ts'
import { dismissError, dismissAllErrors } from '#/lib/error-log.api.ts'

const ERROR_TYPE_COLORS: Record<string, string> = {
  captcha: 'bg-yellow-100 text-yellow-800',
  timeout: 'bg-orange-100 text-orange-800',
  form_stuck: 'bg-red-100 text-red-800',
  login_expired: 'bg-blue-100 text-blue-800',
  no_easy_apply: 'bg-gray-100 text-gray-600',
  unknown: 'bg-gray-100 text-gray-600',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ApplyErrorLog({ errors: initialErrors }: { errors: ApplyErrorWithScreenshot[] }) {
  const [errors, setErrors] = useState(initialErrors)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [screenshotId, setScreenshotId] = useState<number | null>(null)
  const [handlerFilter, setHandlerFilter] = useState<string>('')
  const [errorTypeFilter, setErrorTypeFilter] = useState<string>('')

  const filteredErrors = errors.filter((e) => {
    if (handlerFilter && e.handler !== handlerFilter) return false
    if (errorTypeFilter && e.errorType !== errorTypeFilter) return false
    return true
  })

  const handlers = [...new Set(errors.map((e) => e.handler))]
  const errorTypes = [...new Set(errors.map((e) => e.errorType))]

  const handleDismiss = async (id: number) => {
    try {
      await dismissError({ data: { id } })
      setErrors((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      console.error('Failed to dismiss error:', err)
    }
  }

  const handleDismissAll = async () => {
    try {
      await dismissAllErrors()
      setErrors([])
    } catch (err) {
      console.error('Failed to dismiss all errors:', err)
    }
  }

  // screenshotId is used directly in the render to toggle screenshot visibility

  return (
    <section className="island-shell mb-6 mt-6 rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
          <Warning className="h-5 w-5 text-orange-500" />
          Apply Error Log
          {errors.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
              {errors.length}
            </span>
          )}
        </h2>
        {errors.length > 0 && (
          <button
            onClick={handleDismissAll}
            className="flex items-center gap-1 text-xs font-medium text-[var(--sea-ink-soft)] hover:text-red-600"
          >
            <Trash className="h-3 w-3" />
            Clear All
          </button>
        )}
      </div>

      {errors.length === 0 ? (
        <p className="text-sm text-[var(--sea-ink-soft)]">No errors to show.</p>
      ) : (
        <>
          {/* Filters */}
          {(handlers.length > 1 || errorTypes.length > 1) && (
            <div className="mb-4 flex items-center gap-3">
              <Funnel className="h-4 w-4 text-[var(--sea-ink-soft)]" />
              {handlers.length > 1 && (
                <select
                  value={handlerFilter}
                  onChange={(e) => setHandlerFilter(e.target.value)}
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--sea-ink)]"
                >
                  <option value="">All handlers</option>
                  {handlers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              )}
              {errorTypes.length > 1 && (
                <select
                  value={errorTypeFilter}
                  onChange={(e) => setErrorTypeFilter(e.target.value)}
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--sea-ink)]"
                >
                  <option value="">All error types</option>
                  {errorTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Error rows */}
          <div className="space-y-2">
            {filteredErrors.map((error) => (
              <div key={error.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                <div className="flex items-center gap-3 p-3">
                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedId(expandedId === error.id ? null : error.id)}
                    className="shrink-0 text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                  >
                    {expandedId === error.id ? (
                      <CaretDown className="h-4 w-4" />
                    ) : (
                      <CaretRight className="h-4 w-4" />
                    )}
                  </button>

                  {/* Timestamp */}
                  <span className="w-16 shrink-0 text-xs text-[var(--sea-ink-soft)]">
                    {timeAgo(error.createdAt)}
                  </span>

                  {/* Job URL */}
                  <div className="min-w-0 flex-1">
                    {error.jobUrl ? (
                      <a
                        href={error.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm text-[var(--lagoon-deep)] hover:underline"
                      >
                        {error.jobUrl.replace(/https?:\/\/(www\.)?/, '').slice(0, 50)}
                      </a>
                    ) : (
                      <span className="text-sm text-[var(--sea-ink-soft)]">Unknown job</span>
                    )}
                  </div>

                  {/* Handler badge */}
                  <span className="shrink-0 rounded bg-[var(--surface-strong)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sea-ink-soft)]">
                    {error.handler}
                  </span>

                  {/* Error type badge */}
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${ERROR_TYPE_COLORS[error.errorType] || ERROR_TYPE_COLORS.unknown}`}>
                    {error.errorType.replace(/_/g, ' ')}
                  </span>

                  {/* Screenshot button */}
                  {error.screenshotImage && (
                    <button
                      onClick={() => setScreenshotId(screenshotId === error.id ? null : error.id)}
                      className="shrink-0 text-[var(--lagoon)] hover:text-[var(--lagoon-deep)]"
                      title="View screenshot"
                    >
                      <Image className="h-4 w-4" />
                    </button>
                  )}

                  {/* Dismiss */}
                  <button
                    onClick={() => handleDismiss(error.id)}
                    className="shrink-0 text-[var(--sea-ink-soft)] hover:text-red-600"
                    title="Dismiss"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>

                {/* Expanded details */}
                {expandedId === error.id && (
                  <div className="border-t border-[var(--line)] px-3 py-2">
                    <pre className="whitespace-pre-wrap text-xs text-[var(--sea-ink-soft)]">
                      {error.errorMessage}
                    </pre>
                    {error.stepsCompleted !== null && (
                      <div className="mt-1 text-xs text-[var(--sea-ink-soft)]">
                        Steps completed: {error.stepsCompleted}
                      </div>
                    )}
                  </div>
                )}

                {/* Screenshot */}
                {screenshotId === error.id && error.screenshotImage && (
                  <div className="border-t border-[var(--line)] p-3">
                    <img
                      src={`data:image/png;base64,${error.screenshotImage}`}
                      alt="Error screenshot"
                      className="max-h-80 rounded border border-[var(--line)] object-contain"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
