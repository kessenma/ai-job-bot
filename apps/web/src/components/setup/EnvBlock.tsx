import { useState } from 'react'
import { Copy, CheckCircle } from '@phosphor-icons/react'

export function EnvBlock() {
  const [copied, setCopied] = useState(false)
  const envText = `GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback`

  const handleCopy = () => {
    navigator.clipboard.writeText(envText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <pre className="rounded-lg bg-[var(--surface)] p-4 text-xs text-[var(--sea-ink)]">
        {envText}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--sea-ink-soft)] transition hover:text-[var(--sea-ink)]"
      >
        {copied ? (
          <>
            <CheckCircle className="h-3 w-3 text-green-600" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            Copy
          </>
        )}
      </button>
    </div>
  )
}
