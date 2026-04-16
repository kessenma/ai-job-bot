import { EUR_TO_USD, parseRange, formatRange } from './salary-utils.ts'
import { inputClass } from './profile-constants.ts'

export function SalaryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Stored value is always "MIN-MAX EUR" format
  const range = parseRange(value)
  const eurStr = range ? formatRange(range.min, range.max) : ''
  const usdStr = range ? formatRange(range.min * EUR_TO_USD, range.max * EUR_TO_USD) : ''

  const handleEur = (raw: string) => {
    const r = parseRange(raw)
    if (!raw.trim()) { onChange(''); return }
    if (r) onChange(`${formatRange(r.min, r.max)} EUR`)
  }

  const handleUsd = (raw: string) => {
    const r = parseRange(raw)
    if (!raw.trim()) { onChange(''); return }
    if (r) onChange(`${formatRange(r.min / EUR_TO_USD, r.max / EUR_TO_USD)} EUR`)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-xs font-medium text-[var(--sea-ink-soft)]">EUR</span>
          <input
            type="text"
            defaultValue={eurStr}
            onBlur={(e) => handleEur(e.target.value)}
            placeholder="65,000-75,000"
            className={inputClass}
            key={`eur-${value}`}
          />
        </div>
      </div>
      <span className="text-xs text-[var(--sea-ink-soft)]">=</span>
      <div className="flex-1">
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-xs font-medium text-[var(--sea-ink-soft)]">USD</span>
          <input
            type="text"
            defaultValue={usdStr}
            onBlur={(e) => handleUsd(e.target.value)}
            placeholder="76,375-88,125"
            className={inputClass}
            key={`usd-${value}`}
          />
        </div>
      </div>
    </div>
  )
}
