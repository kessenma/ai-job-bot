import { isSheetsConfigured, loadJobsFromSheet } from './sheets.server.ts'
import { isAuthenticated } from './gmail.server.ts'
import { ensureDb } from '@job-app-bot/db/init'
import type { JobLead } from './types.ts'

export async function loadJobs(): Promise<JobLead[]> {
  await ensureDb()

  if (isSheetsConfigured() && isAuthenticated()) {
    return await loadJobsFromSheet()
  }

  return []
}

export type { JobLead }
