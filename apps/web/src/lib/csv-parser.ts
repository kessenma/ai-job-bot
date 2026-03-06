import Papa from 'papaparse'
import { classifyATS } from './ats-classifier.ts'
import type { JobLead } from './types.ts'

const CSV_HEADERS = [
  'date',
  'company',
  'role',
  'location',
  'recruiterLinkedin',
  'recruiterEmail',
  'recruiterPhone',
  'jobUrl',
  'activityStatus',
  'alignmentStatus',
  'candidateRemarks',
  'applicationStatus',
  'followUpEmailStatus',
  'accountManagerRemarks',
] as const

export function parseJobsCsv(csvText: string): JobLead[] {
  const result = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  })

  // Skip the header row
  const rows = result.data as string[][]
  return rows.slice(1).map((row) => {
    const job: Record<string, string> = {}
    CSV_HEADERS.forEach((key, i) => {
      job[key] = (row[i] ?? '').trim()
    })
    return {
      ...job,
      atsPlatform: classifyATS(job.jobUrl ?? ''),
    } as unknown as JobLead
  })
}
