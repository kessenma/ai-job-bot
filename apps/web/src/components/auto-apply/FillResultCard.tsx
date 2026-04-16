import { Robot } from '@phosphor-icons/react'
import type { FillFormResult } from '#/lib/playwright.api.ts'

export function FillResultCard({ result, onClose }: { result: FillFormResult; onClose: () => void }) {
  return (
    <section className="island-shell mb-8 rounded-xl p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
          <Robot className="h-5 w-5 text-[var(--lagoon)]" />
          Form Fill Result
        </h2>
        <button onClick={onClose} className="text-xs text-[var(--sea-ink-soft)] hover:underline">
          Dismiss
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Filled fields */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-green-700">
            Filled ({result.filled.length})
          </h3>
          {result.filled.length === 0 ? (
            <p className="text-xs text-[var(--sea-ink-soft)]">No fields were auto-filled.</p>
          ) : (
            <div className="space-y-1">
              {result.filled.map((f, i) => (
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

        {/* Skipped fields */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-yellow-700">
            Skipped ({result.skipped.length})
          </h3>
          {result.skipped.length === 0 ? (
            <p className="text-xs text-[var(--sea-ink-soft)]">All detected fields were filled.</p>
          ) : (
            <div className="space-y-1">
              {result.skipped.map((field, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="inline-flex rounded-full bg-yellow-100 px-1.5 py-0.5 font-bold uppercase text-yellow-700">
                    skip
                  </span>
                  <span className="text-[var(--sea-ink)]">{field.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Screenshot of filled form */}
      <div className="overflow-hidden rounded-lg border border-[var(--line)]">
        <img
          src={`data:image/png;base64,${result.screenshot}`}
          alt={result.title ?? 'Filled form'}
          className="w-full"
        />
      </div>
    </section>
  )
}
