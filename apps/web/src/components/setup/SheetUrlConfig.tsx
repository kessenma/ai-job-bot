import { useState, useCallback } from 'react'
import {
  Link as LinkIcon, LinkBreak, CircleNotch, CheckCircle,
} from '@phosphor-icons/react'
import { setSheetsUrl, removeSheetsUrl } from '#/lib/sheets.api.ts'

export function SheetUrlConfig({
  initialUrl,
  authenticated,
}: {
  initialUrl: string | null
  authenticated: boolean
}) {
  const [url, setUrl] = useState(initialUrl ?? '')
  const [savedUrl, setSavedUrl] = useState(initialUrl)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    if (!url.trim()) return
    setSaving(true)
    setError(null)
    try {
      await setSheetsUrl({ data: { url: url.trim() } })
      setSavedUrl(url.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [url])

  const handleDisconnect = useCallback(async () => {
    setSaving(true)
    try {
      await removeSheetsUrl()
      setUrl('')
      setSavedUrl(null)
    } finally {
      setSaving(false)
    }
  }, [])

  return (
    <section className="island-shell rounded-2xl p-6">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-[var(--sea-ink)]">
        <LinkIcon className="h-4 w-4 text-[var(--lagoon)]" />
        Google Sheet URL
      </h3>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Paste the URL of your job tracking spreadsheet. The dashboard will pull live data from it.
      </p>

      {savedUrl ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-green-700">Sheet connected</div>
            <div className="truncate text-xs text-green-600">{savedUrl}</div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
          >
            <LinkBreak className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit"
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none"
            />
            <button
              onClick={handleSave}
              disabled={saving || !url.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <CircleNotch className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              Connect
            </button>
          </div>
          {!authenticated && (
            <p className="mt-2 text-xs text-amber-600">
              You need to connect your Google account first (step 2 above) before the sheet can be read.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}
    </section>
  )
}
