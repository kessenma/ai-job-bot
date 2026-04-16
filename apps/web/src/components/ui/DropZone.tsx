import { UploadSimple } from '@phosphor-icons/react'

export function DropZone({
  accept,
  label,
  hint,
  uploading,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  inputRef,
  onInputChange,
  compact,
  multiple,
}: {
  accept: string
  label: string
  hint: string
  uploading: boolean
  dragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (file: File) => void
  onClick: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  compact?: boolean
  multiple?: boolean
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        const files = Array.from(e.dataTransfer.files)
        for (const file of files) onDrop(file)
      }}
      onClick={onClick}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed transition ${
        compact ? 'p-4' : 'p-10'
      } ${
        dragOver
          ? 'border-[var(--lagoon)] bg-[rgba(79,184,178,0.08)]'
          : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--lagoon-deep)] hover:bg-[var(--surface-strong)]'
      }`}
    >
      <UploadSimple
        className={`${compact ? 'h-6 w-6' : 'h-10 w-10'} ${
          dragOver ? 'text-[var(--lagoon)]' : 'text-[var(--sea-ink-soft)]'
        }`}
      />
      <div className="text-center">
        <span className={`font-medium text-[var(--sea-ink)] ${compact ? 'text-sm' : ''}`}>
          {uploading ? 'Uploading...' : label}
        </span>
        {!compact && <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">{hint}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onInputChange}
        className="hidden"
      />
    </div>
  )
}
