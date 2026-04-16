import { useState } from 'react'
import { StatusPill } from '#/components/ui/StatusPill.tsx'
import { StepCard } from './StepCard.tsx'
import type { Step } from './setup-steps.tsx'

export function SetupSection({
  icon,
  title,
  subtitle,
  status,
  statusText,
  steps,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  status: 'done' | 'ready' | 'pending'
  statusText: string
  steps: Step[]
}) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())
  const allExpanded = expandedSteps.size === steps.length

  function toggleStep(i: number) {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
      } else {
        next.add(i)
      }
      return next
    })
  }

  function toggleAll() {
    if (allExpanded) {
      setExpandedSteps(new Set())
    } else {
      setExpandedSteps(new Set(steps.map((_, i) => i)))
    }
  }

  const statusVariant = {
    done: 'success',
    ready: 'info',
    pending: 'warning',
  } as const

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {icon}
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">{title}</h2>
            <p className="text-sm text-[var(--sea-ink-soft)]">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={toggleAll}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--lagoon)] transition hover:bg-[var(--surface)]"
          >
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
          <StatusPill variant={statusVariant[status]}>
            {statusText}
          </StatusPill>
        </div>
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <StepCard
            key={i}
            stepNumber={i + 1}
            title={step.title}
            description={step.description}
            image={step.image}
            link={step.link}
            expanded={expandedSteps.has(i)}
            onToggle={() => toggleStep(i)}
          />
        ))}
      </div>
    </div>
  )
}
