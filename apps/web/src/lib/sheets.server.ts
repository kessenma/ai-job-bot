import { google } from 'googleapis'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyATS } from './ats-classifier.ts'
import { getAuthenticatedClient, isAuthenticated } from './gmail.server.ts'
import type { JobLead } from './types.ts'

const SHEET_CONFIG_PATH = resolve(process.cwd(), 'uploads', '.sheet-config.json')

// Map from possible sheet header names to our internal field names
const HEADER_MAP: Record<string, keyof Omit<JobLead, 'atsPlatform'>> = {
  'date': 'date',
  'company': 'company',
  'role': 'role',
  'location': 'location',
  'recruiter linkedin link': 'recruiterLinkedin',
  'recruiter linkedin': 'recruiterLinkedin',
  'recruiter email id': 'recruiterEmail',
  'recruiter email': 'recruiterEmail',
  'email': 'recruiterEmail',
  'recruiter phone number': 'recruiterPhone',
  'recruiter phone': 'recruiterPhone',
  'phone': 'recruiterPhone',
  'link to the position': 'jobUrl',
  'job url': 'jobUrl',
  'job link': 'jobUrl',
  'url': 'jobUrl',
  'activity status': 'activityStatus',
  'alignment status': 'alignmentStatus',
  'candidates remarks if the leads are not aligned/partially aligned': 'candidateRemarks',
  'candidate remarks': 'candidateRemarks',
  'remarks': 'candidateRemarks',
  'application status': 'applicationStatus',
  'follow up email status': 'followUpEmailStatus',
  'follow-up email status': 'followUpEmailStatus',
  "account manager's remarks regarding applications": 'accountManagerRemarks',
  'account manager remarks': 'accountManagerRemarks',
}

let cachedJobs: JobLead[] | null = null
let cachedAt = 0
const CACHE_TTL = 60_000 // 1 minute

function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}

function loadConfig(): { url: string; sheetId: string } | null {
  if (!existsSync(SHEET_CONFIG_PATH)) return null
  try {
    return JSON.parse(readFileSync(SHEET_CONFIG_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function getSheetId(): string | null {
  if (process.env.GOOGLE_SHEET_ID) return process.env.GOOGLE_SHEET_ID
  return loadConfig()?.sheetId ?? null
}

export function getSheetUrl(): string | null {
  const config = loadConfig()
  if (config) return config.url
  if (process.env.GOOGLE_SHEET_ID) {
    return `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`
  }
  return null
}

export function isSheetsConfigured(): boolean {
  return !!getSheetId()
}

export function saveSheetUrl(url: string): void {
  const sheetId = extractSheetId(url)
  if (!sheetId) {
    throw new Error('Invalid Google Sheets URL. Expected: https://docs.google.com/spreadsheets/d/SHEET_ID/edit')
  }
  writeFileSync(SHEET_CONFIG_PATH, JSON.stringify({ url, sheetId }, null, 2))
  clearSheetsCache()
}

export function clearSheetUrl(): void {
  if (existsSync(SHEET_CONFIG_PATH)) {
    unlinkSync(SHEET_CONFIG_PATH)
  }
  clearSheetsCache()
}

function buildColumnMapping(headerRow: string[]): Map<number, keyof Omit<JobLead, 'atsPlatform'>> {
  const mapping = new Map<number, keyof Omit<JobLead, 'atsPlatform'>>()
  headerRow.forEach((header, index) => {
    const normalized = header.toLowerCase().trim()
    const field = HEADER_MAP[normalized]
    if (field) {
      mapping.set(index, field)
    }
  })
  return mapping
}

// Find the header row by scanning for the first row that maps to at least 2 known columns
function findHeaderRow(rows: string[][]): { headerIndex: number; mapping: Map<number, keyof Omit<JobLead, 'atsPlatform'>> } | null {
  const maxScan = Math.min(rows.length, 30) // scan up to 30 rows for header
  for (let i = 0; i < maxScan; i++) {
    const mapping = buildColumnMapping(rows[i]!)
    if (mapping.size >= 2) {
      return { headerIndex: i, mapping }
    }
  }
  return null
}

async function fetchSheetRows(): Promise<string[][]> {
  const sheetId = getSheetId()
  if (!sheetId) throw new Error('No Google Sheet configured')
  if (!isAuthenticated()) throw new Error('Not authenticated. Connect your Google account first.')

  const auth = getAuthenticatedClient()
  const sheets = google.sheets({ version: 'v4', auth })

  // First, get the list of sheet tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
  const sheetTabs = meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) as string[]
  console.log('Sheet tabs found:', sheetTabs)

  // Try each tab until we find one with recognizable headers
  for (const tab of sheetTabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${tab}'!A1:Z`,
    })
    const rows = (res.data.values ?? []) as string[][]
    if (rows.length === 0) continue

    const headerResult = findHeaderRow(rows)
    if (headerResult) {
      console.log(`Using sheet tab "${tab}" — header found at row ${headerResult.headerIndex + 1}`)
      return rows
    }
    console.log(`Tab "${tab}" — no header row found in first 30 rows (${rows.length} total rows, first row: ${JSON.stringify(rows[0]?.slice(0, 3))})`)
  }

  // Fallback: return first tab data
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A1:Z',
  })
  return (res.data.values ?? []) as string[][]
}

export async function loadJobsFromSheet(): Promise<JobLead[]> {
  // Return cached data if fresh
  if (cachedJobs && Date.now() - cachedAt < CACHE_TTL) {
    return cachedJobs
  }

  const rows = await fetchSheetRows()
  if (rows.length <= 1) return []

  const result = findHeaderRow(rows)
  if (!result) {
    console.error('Sheet header mapping failed. First rows:', rows.slice(0, 5).map(r => r.join(', ')))
    throw new Error('Could not map any sheet columns. Check that your sheet has recognizable headers (Company, Role, etc.).')
  }

  const { headerIndex, mapping: columnMapping } = result
  const headerRow = rows[headerIndex]!

  console.log(`Sheet header found at row ${headerIndex + 1}: ${[...columnMapping.entries()].map(([i, f]) => `${headerRow[i]} -> ${f}`).join(', ')}`)

  const jobs: JobLead[] = rows.slice(headerIndex + 1).map((row) => {
    const job: Record<string, string> = {
      date: '', company: '', role: '', location: '',
      recruiterLinkedin: '', recruiterEmail: '', recruiterPhone: '',
      jobUrl: '', activityStatus: '', alignmentStatus: '',
      candidateRemarks: '', applicationStatus: '',
      followUpEmailStatus: '', accountManagerRemarks: '',
    }

    columnMapping.forEach((field, colIndex) => {
      job[field] = (row[colIndex] ?? '').trim()
    })

    return {
      ...job,
      atsPlatform: classifyATS(job.jobUrl ?? ''),
    } as unknown as JobLead
  })

  cachedJobs = jobs
  cachedAt = Date.now()
  return jobs
}

// Debug: return raw headers and first few rows
export async function debugSheetData(): Promise<{ headers: string[]; sampleRows: string[][]; mappedFields: string[] }> {
  const rows = await fetchSheetRows()
  if (rows.length === 0) return { headers: [], sampleRows: [], mappedFields: [] }

  const result = findHeaderRow(rows)
  const headerIndex = result?.headerIndex ?? 0
  const headers = rows[headerIndex]!
  const mapping = result?.mapping ?? buildColumnMapping(headers)
  const mappedFields = [...mapping.entries()].map(([i, f]) => `[${i}] "${headers[i]}" -> ${f}`)

  return {
    headers,
    sampleRows: rows.slice(headerIndex + 1, headerIndex + 4),
    mappedFields,
  }
}

export function clearSheetsCache() {
  cachedJobs = null
  cachedAt = 0
}
