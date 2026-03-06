import { redirect } from '@tanstack/react-router'

export function requireAuth({ context }: { context: unknown }) {
  const { auth } = context as { auth: { authenticated: boolean } }
  if (!auth.authenticated) {
    throw redirect({ to: '/' })
  }
}
