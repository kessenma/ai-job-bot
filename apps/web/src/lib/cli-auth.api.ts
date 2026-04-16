import { createServerFn } from '@tanstack/react-start'
import { startAuthProcess, pollAuthProcess, killAuthProcess } from './cli-auth.server.ts'

export const startCliAuth = createServerFn({ method: 'POST' })
  .inputValidator((data: { cli: 'claude' | 'codex' | 'gh' }) => data)
  .handler(async ({ data }) => {
    return startAuthProcess(data.cli)
  })

export const pollCliAuth = createServerFn({ method: 'POST' })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    return pollAuthProcess(data.sessionId)
  })

export const stopCliAuth = createServerFn({ method: 'POST' })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    killAuthProcess(data.sessionId)
    return { ok: true }
  })
