import { createServerFn } from '@tanstack/react-start'
import {
  isAuthenticated,
  isConfigured,
  scanEmailsForCompany,
  sendEmail,
  disconnectGmail,
  getAuthUrl,
  handleAuthCallback,
} from './gmail.server.ts'
import { saveScannedEmails, loadSavedEmails, getSavedEmailCount } from './emails.server.ts'
import { isSessionValid, verifyPassword, createSession, destroySession } from './auth.server.ts'
import type { ScanResult, EmailClassification } from './gmail.server.ts'

export const getAuthState = createServerFn({ method: 'GET' }).handler(() => {
  return { authenticated: isSessionValid() }
})

export const loginWithPassword = createServerFn({ method: 'POST' })
  .inputValidator((data: { password: string }) => data)
  .handler(({ data }) => {
    if (!verifyPassword(data.password)) {
      return { success: false as const, error: 'Invalid password' }
    }
    createSession()
    return { success: true as const, error: null }
  })

export const logoutSession = createServerFn({ method: 'POST' }).handler(() => {
  destroySession()
  return { success: true }
})

export const getGmailStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const configured = isConfigured()
  const connected = configured && isAuthenticated()
  return {
    configured,
    connected,
    authUrl: configured ? getAuthUrl() : null,
    savedEmailCount: await getSavedEmailCount(),
  }
})

export const scanOneCompany = createServerFn({ method: 'POST' })
  .inputValidator((data: { company: string }) => data)
  .handler(async ({ data }): Promise<ScanResult> => {
    const emails = await scanEmailsForCompany(data.company)
    const rejections = emails.filter((e) => e.classification === 'rejection')
    const interviews = emails.filter((e) => e.classification === 'interview')
    const applied = emails.filter((e) => e.classification === 'applied')

    let suggestedStatus: EmailClassification | null = null
    if (applied.length > 0) suggestedStatus = 'applied'
    if (rejections.length > 0) suggestedStatus = 'rejection'
    if (interviews.length > 0) suggestedStatus = 'interview'

    const result: ScanResult = { company: data.company, emails, suggestedStatus }
    await saveScannedEmails([result])

    // Set respondedAt on matching job records when recruiter emails are found
    if (emails.length > 0) {
      try {
        const { db, schema } = await import('@job-app-bot/db')
        const { eq } = await import('drizzle-orm')
        // Find jobs matching this company that don't have respondedAt set yet
        const jobs = await db
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(eq(schema.jobs.company, data.company))
        for (const job of jobs) {
          await db
            .update(schema.jobs)
            .set({ respondedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
            .where(eq(schema.jobs.id, job.id))
        }
      } catch (err) {
        console.error('Failed to set respondedAt on jobs:', err)
      }
    }

    return result
  })

export const getSavedEmails = createServerFn({ method: 'GET' }).handler(() => {
  return loadSavedEmails()
})

export const sendGmailEmail = createServerFn({ method: 'POST' })
  .inputValidator((data: { to: string; subject: string; body: string }) => data)
  .handler(async ({ data }) => {
    const result = await sendEmail(data.to, data.subject, data.body)
    return { success: true, messageId: result.messageId }
  })

export const disconnectGmailAccount = createServerFn({ method: 'POST' }).handler(() => {
  disconnectGmail()
  return { success: true }
})

export const processGmailCallback = createServerFn({ method: 'POST' })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    await handleAuthCallback(data.code)
    return { success: true }
  })

// --- Workday Verification Email ---

export const findWorkdayVerification = createServerFn({ method: 'POST' })
  .inputValidator((data: { maxAgeMins?: number }) => data)
  .handler(async ({ data }) => {
    const { findWorkdayVerificationEmail } = await import('./gmail.server.ts')
    return findWorkdayVerificationEmail(data.maxAgeMins ?? 15)
  })
