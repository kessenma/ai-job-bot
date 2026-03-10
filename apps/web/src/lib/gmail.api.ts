import { createServerFn } from '@tanstack/react-start'
import {
  isAuthenticated,
  isConfigured,
  scanEmailsForCompany,
  sendEmail,
  disconnectGmail,
  getAuthUrl,
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
