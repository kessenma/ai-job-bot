import { google } from 'googleapis'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyATS } from '@job-app-bot/shared/ats-classifier'
import type { JobLead } from '@job-app-bot/shared/types'

type JsonFn = (data: unknown, status?: number) => Response

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const SHEET_CONFIG_PATH = resolve(dataDir, '.sheet-config.json')
const TOKEN_PATH = resolve(dataDir, '.gmail-token.json')

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

function getSheetId(): string | null {
  if (process.env.GOOGLE_SHEET_ID) return process.env.GOOGLE_SHEET_ID
  return loadConfig()?.sheetId ?? null
}

function getAuthenticatedClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback'

  if (!clientId || !clientSecret) {
    throw new Error('Google API credentials not configured')
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  if (!existsSync(TOKEN_PATH)) {
    throw new Error('Not authenticated. Connect your Google account first.')
  }
  const tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'))
  oauth2Client.setCredentials(tokens)

  oauth2Client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens }
    writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2))
  })

  return oauth2Client
}

function buildColumnMapping(headerRow: string[]): Map<number, keyof Omit<JobLead, 'atsPlatform'>> {
  const mapping = new Map<number, keyof Omit<JobLead, 'atsPlatform'>>()
  headerRow.forEach((header, index) => {
    const normalized = header.toLowerCase().trim()
    const field = HEADER_MAP[normalized]
    if (field) mapping.set(index, field)
  })
  return mapping
}

function findHeaderRow(rows: string[][]): { headerIndex: number; mapping: Map<number, keyof Omit<JobLead, 'atsPlatform'>> } | null {
  const maxScan = Math.min(rows.length, 30)
  for (let i = 0; i < maxScan; i++) {
    const mapping = buildColumnMapping(rows[i]!)
    if (mapping.size >= 2) return { headerIndex: i, mapping }
  }
  return null
}

export async function handleSheetsRoutes(req: Request, url: URL, json: JsonFn): Promise<Response> {
  const path = url.pathname

  if (req.method === 'GET' && path === '/api/sheets/status') {
    const config = loadConfig()
    return json({
      configured: !!getSheetId(),
      url: config?.url ?? null,
    })
  }

  if (req.method === 'POST' && path === '/api/sheets/url') {
    const body = await req.json() as { url: string }
    const sheetId = extractSheetId(body.url)
    if (!sheetId) {
      return json({ error: 'Invalid Google Sheets URL' }, 400)
    }
    writeFileSync(SHEET_CONFIG_PATH, JSON.stringify({ url: body.url, sheetId }, null, 2))
    return json({ ok: true })
  }

  if (req.method === 'DELETE' && path === '/api/sheets/url') {
    if (existsSync(SHEET_CONFIG_PATH)) unlinkSync(SHEET_CONFIG_PATH)
    return json({ ok: true })
  }

  if (req.method === 'GET' && path === '/api/sheets/sync') {
    const sheetId = getSheetId()
    if (!sheetId) return json({ error: 'No sheet configured' }, 400)

    const auth = getAuthenticatedClient()
    const sheets = google.sheets({ version: 'v4', auth })

    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
    const sheetTabs = meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) as string[]

    let allRows: string[][] = []
    for (const tab of sheetTabs) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${tab}'!A1:Z`,
      })
      const rows = (res.data.values ?? []) as string[][]
      if (rows.length === 0) continue
      const headerResult = findHeaderRow(rows)
      if (headerResult) {
        allRows = rows
        break
      }
    }

    if (allRows.length === 0) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'A1:Z',
      })
      allRows = (res.data.values ?? []) as string[][]
    }

    const result = findHeaderRow(allRows)
    if (!result) return json({ error: 'Could not find recognizable headers in sheet' }, 400)

    const { headerIndex, mapping } = result
    const jobs: JobLead[] = allRows.slice(headerIndex + 1).map((row) => {
      const job: Record<string, string> = {
        date: '', company: '', role: '', location: '',
        recruiterLinkedin: '', recruiterEmail: '', recruiterPhone: '',
        jobUrl: '', activityStatus: '', alignmentStatus: '',
        candidateRemarks: '', applicationStatus: '',
        followUpEmailStatus: '', accountManagerRemarks: '',
      }
      mapping.forEach((field, colIndex) => {
        job[field] = (row[colIndex] ?? '').trim()
      })
      return { ...job, atsPlatform: classifyATS(job.jobUrl ?? '') } as unknown as JobLead
    })

    return json(jobs)
  }

  return json({ error: 'Not found' }, 404)
}
