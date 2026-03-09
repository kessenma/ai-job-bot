import { useCallback, useState } from 'react'
import { CircleNotch, SignOut } from '@phosphor-icons/react'
import { useRouter } from '@tanstack/react-router'
import { logoutSession } from '#/lib/gmail.api.ts'

export function LogoutSection() {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = useCallback(async () => {
    setLoggingOut(true)
    try {
      await logoutSession()
      await router.navigate({ to: '/' })
      router.invalidate()
    } catch {
      setLoggingOut(false)
    }
  }, [router])

  return (
    <section className="mt-6 island-shell rounded-2xl p-6">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]">
        <SignOut className="h-5 w-5 text-red-500" />
        Account
      </h2>
      <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
        Sign out of your account.
      </p>
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
      >
        {loggingOut ? (
          <CircleNotch className="h-4 w-4 animate-spin" />
        ) : (
          <SignOut className="h-4 w-4" />
        )}
        Sign out
      </button>
    </section>
  )
}
