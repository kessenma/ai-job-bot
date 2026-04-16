const VARIANT_COLORS = {
  success: 'bg-green-500/10 text-green-700',
  info: 'bg-blue-500/10 text-blue-700',
  warning: 'bg-amber-500/10 text-amber-700',
} as const

export function StatusPill({
  variant,
  children,
}: {
  variant: keyof typeof VARIANT_COLORS
  children: React.ReactNode
}) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${VARIANT_COLORS[variant]}`}>
      {children}
    </span>
  )
}
