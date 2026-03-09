import { api } from './client'
import type { JobLead } from '@job-app-bot/shared'

export async function getJobs(): Promise<JobLead[]> {
  return api<JobLead[]>('/api/jobs')
}
