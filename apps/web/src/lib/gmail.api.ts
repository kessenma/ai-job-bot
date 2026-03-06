import { createServerFn } from '@tanstack/react-start'
import {
  getAuthUrl,
  isAuthenticated,
  isConfigured,
  scanAllCompanies,
  scanEmailsForCompany,
  disconnectGmail,
  handleAuthCallback,
} from './gmail.server.ts'
import { saveScannedEmails, loadSavedEmails, getSavedEmailCount } from './emails.server.ts'
import type { ScanResult, EmailClassification } from './gmail.server.ts'

export const getAuthState = createServerFn({ method: 'GET' }).handler(() => {
  const configured = isConfigured()
  const authenticated = configured && isAuthenticated()
  return {
    configured,
    authenticated,
    authUrl: configured && !authenticated ? getAuthUrl() : null,
  }
})

export const getGmailStatus = createServerFn({ method: 'GET' }).handler(() => {
  const configured = isConfigured()
  const connected = configured && isAuthenticated()
  return {
    configured,
    connected,
    authUrl: configured && !connected ? getAuthUrl() : null,
    savedEmailCount: getSavedEmailCount(),
  }
})

export const exchangeGmailCode = createServerFn({ method: 'POST' })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    await handleAuthCallback(data.code)
    return { success: true }
  })

export const scanEmails = createServerFn({ method: 'POST' })
  .inputValidator((data: { companies: string[] }) => data)
  .handler(async ({ data }): Promise<ScanResult[]> => {
    const results = await scanAllCompanies(data.companies)
    saveScannedEmails(results)
    return results
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
    saveScannedEmails([result])
    return result
  })

export const getSavedEmails = createServerFn({ method: 'GET' }).handler(() => {
  return loadSavedEmails()
})

export const disconnectGmailAccount = createServerFn({ method: 'POST' }).handler(() => {
  disconnectGmail()
  return { success: true }
})
