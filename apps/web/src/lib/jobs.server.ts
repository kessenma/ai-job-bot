import { readFileSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseJobsCsv } from './csv-parser.ts'
import { isSheetsConfigured, loadJobsFromSheet } from './sheets.server.ts'
import { isAuthenticated } from './gmail.server.ts'
import { ensureDb } from '@job-app-bot/db/init'
import type { JobLead } from './types.ts'

let cachedJobs: JobLead[] | null = null
let cachedMtime: number = 0

function loadJobsFromCsv(): JobLead[] {
  const csvPath = resolve(process.cwd(), 'data.csv')
  if (!existsSync(csvPath)) return []

  const stat = statSync(csvPath)
  if (cachedJobs && stat.mtimeMs === cachedMtime) {
    return cachedJobs
  }

  const csvText = readFileSync(csvPath, 'utf-8')
  cachedJobs = parseJobsCsv(csvText)
  cachedMtime = stat.mtimeMs
  return cachedJobs
}

export async function loadJobs(): Promise<JobLead[]> {
  await ensureDb()

  // If Google Sheets is configured and authenticated, use it
  if (isSheetsConfigured() && isAuthenticated()) {
    try {
      return await loadJobsFromSheet()
    } catch (err) {
      console.error('Failed to load from Google Sheets, falling back to CSV:', err)
    }
  }

  // Fallback to local CSV
  return loadJobsFromCsv()
}

export type { JobLead }
