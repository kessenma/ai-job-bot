export function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string
  value: number
  colorClass?: string
}) {
  return (
    <div className={`rounded-xl p-4 ${colorClass ?? 'bg-[var(--surface)]'}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  )
}
