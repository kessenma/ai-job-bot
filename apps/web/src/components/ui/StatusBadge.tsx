import { STATUS_COLORS, getStatusColorKey } from '#/lib/color-maps.ts'

export function StatusBadge({ status }: { status: string }) {
  const key = getStatusColorKey(status)
  const color = key ? STATUS_COLORS[key] : 'bg-gray-100 text-gray-600'

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status || '\u2014'}
    </span>
  )
}
