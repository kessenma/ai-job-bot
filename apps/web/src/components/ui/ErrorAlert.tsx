import { WarningCircle } from '@phosphor-icons/react'

export function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
      <WarningCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  )
}
