import { api } from './client'

export interface GmailStatus {
  configured: boolean
  authenticated: boolean
}

export async function getGmailStatus(): Promise<GmailStatus> {
  return api('/api/gmail/status')
}

export async function scanEmails(companies: string[]): Promise<unknown[]> {
  return api('/api/gmail/scan', {
    method: 'POST',
    body: JSON.stringify({ companies }),
  })
}

export async function getSavedEmails(): Promise<unknown[]> {
  return api('/api/gmail/emails')
}
