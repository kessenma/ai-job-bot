import { useCallback, useState } from 'react'
import { GoogleLogo, CircleNotch } from '@phosphor-icons/react'
import { getPickerToken } from '#/lib/resume.api.ts'

declare global {
  interface Window {
    gapi: {
      load: (api: string, callback: () => void) => void
    }
    google: {
      picker: {
        PickerBuilder: new () => PickerBuilder
        DocsView: new (viewId?: string) => DocsView
        Action: { PICKED: string; CANCEL: string }
        ViewId: { DOCS: string }
      }
    }
  }
}

interface DocsView {
  setIncludeFolders: (include: boolean) => DocsView
  setMimeTypes: (mimeTypes: string) => DocsView
}

interface PickerBuilder {
  addView: (view: DocsView) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setCallback: (callback: (data: PickerResult) => void) => PickerBuilder
  setTitle: (title: string) => PickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

interface PickerResult {
  action: string
  docs?: Array<{
    id: string
    name: string
    mimeType: string
  }>
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export function GoogleDrivePicker({
  onSelect,
  disabled,
}: {
  onSelect: (file: { id: string; name: string; mimeType: string }) => void
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)

  const openPicker = useCallback(async () => {
    setLoading(true)
    try {
      await loadScript('https://apis.google.com/js/api.js')

      await new Promise<void>((resolve) => {
        window.gapi.load('picker', resolve)
      })

      const { accessToken } = await getPickerToken()

      const docsView = new window.google.picker.DocsView()
        .setIncludeFolders(true)
        .setMimeTypes(
          [
            'application/vnd.google-apps.document',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ].join(','),
        )

      const picker = new window.google.picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(accessToken)
        .setTitle('Select a resume from Google Drive')
        .setCallback((data: PickerResult) => {
          if (data.action === window.google.picker.Action.PICKED && data.docs?.[0]) {
            const doc = data.docs[0]
            onSelect({ id: doc.id, name: doc.name, mimeType: doc.mimeType })
          }
        })
        .build()

      picker.setVisible(true)
    } catch (err) {
      console.error('Failed to open Google Drive picker:', err)
    } finally {
      setLoading(false)
    }
  }, [onSelect])

  return (
    <button
      onClick={openPicker}
      disabled={disabled || loading}
      className="flex items-center gap-1.5 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
    >
      {loading ? (
        <CircleNotch className="h-4 w-4 animate-spin" />
      ) : (
        <GoogleLogo className="h-4 w-4" />
      )}
      {loading ? 'Opening...' : 'Browse Google Drive'}
    </button>
  )
}
