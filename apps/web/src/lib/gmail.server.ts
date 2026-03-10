import { google } from 'googleapis'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyEmail, cleanCompanyName, emailMatchesCompany } from '@job-app-bot/shared/email-classifier'
import type { EmailClassification } from '@job-app-bot/shared/email-classifier'

const DATA_DIR = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const TOKEN_PATH = resolve(DATA_DIR, 'uploads', '.gmail-token.json')

export type { EmailClassification }

export interface ScannedEmail {
  from: string
  subject: string
  snippet: string
  date: string
  classification: EmailClassification
  matchedKeywords: string[]
  messageId: string
}

export interface ScanResult {
  company: string
  emails: ScannedEmail[]
  suggestedStatus: EmailClassification | null
}

export function isConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback'

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env')
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  })
}

export async function handleAuthCallback(code: string): Promise<void> {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
}

export function isAuthenticated(): boolean {
  return existsSync(TOKEN_PATH)
}

export function getAuthenticatedClient() {
  const oauth2Client = getOAuth2Client()
  if (!existsSync(TOKEN_PATH)) {
    throw new Error('Not authenticated with Gmail. Please connect your account first.')
  }
  const tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'))
  oauth2Client.setCredentials(tokens)

  // Auto-refresh token
  oauth2Client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens }
    writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2))
  })

  return oauth2Client
}

export async function scanEmailsForCompany(companyName: string): Promise<ScannedEmail[]> {
  const auth = getAuthenticatedClient()
  const gmail = google.gmail({ version: 'v1', auth })

  // Clean the company name and use quoted exact phrase matching
  const cleaned = cleanCompanyName(companyName)
  const query = `{"${cleaned}"} -in:sent`

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 10,
  })

  const messages = res.data.messages ?? []
  const results: ScannedEmail[] = []

  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    })

    const headers = detail.data.payload?.headers ?? []
    const from = headers.find((h) => h.name === 'From')?.value ?? ''
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? ''
    const date = headers.find((h) => h.name === 'Date')?.value ?? ''
    const snippet = detail.data.snippet ?? ''

    // Post-filter: verify this email actually mentions the company
    if (!emailMatchesCompany(from, subject, snippet, companyName)) {
      continue
    }

    const { classification, matchedKeywords } = classifyEmail(subject, snippet)

    results.push({
      from,
      subject,
      snippet,
      date,
      classification,
      matchedKeywords,
      messageId: msg.id!,
    })
  }

  return results
}

export async function scanAllCompanies(companies: string[]): Promise<ScanResult[]> {
  const results: ScanResult[] = []

  // Deduplicate company names
  const unique = [...new Set(companies.map((c) => c.trim()).filter(Boolean))]

  for (const company of unique) {
    try {
      const emails = await scanEmailsForCompany(company)
      const rejections = emails.filter((e) => e.classification === 'rejection')
      const interviews = emails.filter((e) => e.classification === 'interview')
      const applied = emails.filter((e) => e.classification === 'applied')

      let suggestedStatus: EmailClassification | null = null
      if (applied.length > 0) suggestedStatus = 'applied'
      if (rejections.length > 0) suggestedStatus = 'rejection'
      if (interviews.length > 0) suggestedStatus = 'interview' // interview overrides rejection

      results.push({ company, emails, suggestedStatus })
    } catch (err) {
      // Rate limiting or other API errors — skip this company
      console.error(`Failed to scan emails for ${company}:`, err)
      results.push({ company, emails: [], suggestedStatus: null })
    }
  }

  return results
}

export async function sendEmail(to: string, subject: string, body: string): Promise<{ messageId: string }> {
  const auth = getAuthenticatedClient()
  const gmail = google.gmail({ version: 'v1', auth })

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n')

  const raw = Buffer.from(message).toString('base64url')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  return { messageId: res.data.id! }
}

export function disconnectGmail(): void {
  if (existsSync(TOKEN_PATH)) {
    unlinkSync(TOKEN_PATH)
  }
}
