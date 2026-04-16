import { useState } from 'react'
import { CaretDown, CaretUp } from '@phosphor-icons/react'

export function CollapsibleSection({
  trigger,
  defaultOpen = false,
  children,
}: {
  trigger: (open: boolean) => React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        {trigger(open)}
        {open ? (
          <CaretUp className="h-4 w-4 shrink-0 text-[var(--sea-ink-soft)]" />
        ) : (
          <CaretDown className="h-4 w-4 shrink-0 text-[var(--sea-ink-soft)]" />
        )}
      </button>
      {open && children}
    </div>
  )
}
