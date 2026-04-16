import { createFileRoute, redirect } from '@tanstack/react-router'
import { processGmailCallback } from '#/lib/gmail.api.ts'

export const Route = createFileRoute('/auth/callback')({
  beforeLoad: async ({ search }) => {
    const code = (search as Record<string, string>).code
    if (code) {
      await processGmailCallback({ data: { code } })
    }
    throw redirect({ to: '/settings' })
  },
  component: () => null,
})
