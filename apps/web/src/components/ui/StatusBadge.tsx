const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  applied: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  rejection: 'bg-red-100 text-red-700',
  interview: 'bg-purple-100 text-purple-700',
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const color = STATUS_COLORS[s]
    ?? (s.includes('interview') ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600')

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {status || '\u2014'}
    </span>
  )
}
