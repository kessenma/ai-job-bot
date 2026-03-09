import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CircleNotch, CheckCircle, XCircle } from '@phosphor-icons/react'
import { exchangeGmailCode } from '#/lib/gmail.api.ts'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

function AuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (!code) {
      setStatus('error')
      setError('No authorization code received from Google.')
      return
    }

    exchangeGmailCode({ data: { code } })
      .then(() => {
        setStatus('success')
        setTimeout(() => navigate({ to: '/dashboard' }), 1500)
      })
      .catch((err) => {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to connect Gmail')
      })
  }, [navigate])

  return (
    <main className="page-wrap flex min-h-[60vh] items-center justify-center px-4">
      <div className="island-shell rounded-2xl p-8 text-center">
        {status === 'loading' && (
          <>
            <CircleNotch className="mx-auto h-10 w-10 animate-spin text-[var(--lagoon)]" />
            <p className="mt-4 text-[var(--sea-ink)]">Connecting your Gmail account...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="mx-auto h-10 w-10 text-green-600" />
            <p className="mt-4 font-semibold text-[var(--sea-ink)]">Gmail connected!</p>
            <p className="text-sm text-[var(--sea-ink-soft)]">Redirecting to email scanner...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-red-600" />
            <p className="mt-4 font-semibold text-[var(--sea-ink)]">Connection failed</p>
            <p className="text-sm text-red-600">{error}</p>
            <a
              href="/"
              className="mt-4 inline-block rounded-full bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white no-underline"
            >
              Try Again
            </a>
          </>
        )}
      </div>
    </main>
  )
}
