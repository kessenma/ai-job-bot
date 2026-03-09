import { api } from './client'
import type { JobLead } from '@job-app-bot/shared'

export async function getSheetsStatus(): Promise<{ configured: boolean; url: string | null }> {
  return api('/api/sheets/status')
}

export async function setSheetsUrl(url: string): Promise<void> {
  await api('/api/sheets/url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export async function removeSheetsUrl(): Promise<void> {
  await api('/api/sheets/url', { method: 'DELETE' })
}

export async function syncSheets(): Promise<JobLead[]> {
  return api<JobLead[]>('/api/sheets/sync')
}
