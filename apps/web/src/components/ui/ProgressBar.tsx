export function ProgressBar({
  current,
  total,
  label,
}: {
  current: number
  total: number
  label?: string
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--sea-ink-soft)]">
          <span>{label}</span>
          <span>
            {current}/{total} ({pct}%)
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--line)]">
        <div
          className="h-full rounded-full bg-[var(--lagoon)] transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
