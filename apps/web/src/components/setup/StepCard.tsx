import { CaretDown, CaretUp, ArrowSquareOut } from '@phosphor-icons/react'

export function StepCard({
  stepNumber,
  title,
  description,
  image,
  link,
  expanded,
  onToggle,
}: {
  stepNumber: number
  title: string
  description: React.ReactNode
  image: string
  link?: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="island-shell overflow-hidden rounded-xl">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lagoon)] text-xs font-bold text-white">
          {stepNumber}
        </span>
        <span className="flex-1 font-semibold text-[var(--sea-ink)]">{title}</span>
        {expanded ? (
          <CaretUp className="h-4 w-4 text-[var(--sea-ink-soft)]" />
        ) : (
          <CaretDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--line)] p-4">
          <div className="mb-3 text-sm text-[var(--sea-ink-soft)]">{description}</div>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--lagoon)] px-4 py-1.5 text-xs font-medium text-white no-underline transition hover:opacity-90"
            >
              <ArrowSquareOut className="h-3 w-3" />
              Open in Google Cloud
            </a>
          )}
          <img
            src={image}
            alt={`Step ${stepNumber}: ${title}`}
            className="mt-2 w-full rounded-lg border border-[var(--line)] shadow-sm"
          />
        </div>
      )}
    </div>
  )
}
