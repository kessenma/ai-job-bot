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
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/documents',
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

// --- Workday Verification Email ---

export interface WorkdayVerificationResult {
  found: boolean
  verificationLink: string | null
  subject: string | null
  from: string | null
  messageId: string | null
}

/**
 * Search Gmail for a recent Workday account verification email and extract the
 * verification link. Searches for emails from Workday received in the last hour.
 */
export async function findWorkdayVerificationEmail(
  maxAgeMins = 15,
): Promise<WorkdayVerificationResult> {
  const auth = getAuthenticatedClient()
  const gmail = google.gmail({ version: 'v1', auth })

  // Search for Workday verification emails received recently
  const afterEpoch = Math.floor((Date.now() - maxAgeMins * 60 * 1000) / 1000)
  const query = `from:(workday.com OR myworkdayjobs.com) subject:(verify OR verification OR confirm OR activate) after:${afterEpoch} -in:sent`

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 5,
  })

  const messages = res.data.messages ?? []
  if (messages.length === 0) {
    return { found: false, verificationLink: null, subject: null, from: null, messageId: null }
  }

  // Check each message for a verification link
  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'full',
    })

    const headers = detail.data.payload?.headers ?? []
    const from = headers.find((h) => h.name === 'From')?.value ?? null
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? null

    // Extract email body (HTML or plain text)
    const body = extractEmailBody(detail.data.payload)
    if (!body) continue

    // Look for verification links in the email body
    const link = extractVerificationLink(body)
    if (link) {
      return { found: true, verificationLink: link, subject, from, messageId: msg.id! }
    }
  }

  return { found: false, verificationLink: null, subject: null, from: null, messageId: null }
}

/** Recursively extract email body text from Gmail message payload */
function extractEmailBody(payload: any): string | null {
  if (!payload) return null

  // Direct body data
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
  }

  // Multipart: prefer HTML, fallback to plain text
  if (payload.parts) {
    let html: string | null = null
    let plain: string | null = null

    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        html = Buffer.from(part.body.data, 'base64url').toString('utf-8')
      } else if (part.mimeType === 'text/plain' && part.body?.data) {
        plain = Buffer.from(part.body.data, 'base64url').toString('utf-8')
      } else if (part.parts) {
        // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
        const nested = extractEmailBody(part)
        if (nested) html = html || nested
      }
    }
    return html || plain
  }

  return null
}

/** Extract a Workday verification/confirmation link from email body */
function extractVerificationLink(body: string): string | null {
  // Common patterns for Workday verification links:
  // - https://wd5.myworkdayjobs.com/... with verify/confirm/activate in path or params
  // - https://company.wd5.myworkdayjobs.com/wday/authgwy/.../confirm/...
  // - Direct href links containing workday verification tokens

  const linkPatterns = [
    // HTML href links from Workday domains
    /href=["'](https?:\/\/[^"']*myworkdayjobs\.com[^"']*(?:verify|confirm|activate|token|validate)[^"']*)["']/gi,
    /href=["'](https?:\/\/[^"']*workday\.com[^"']*(?:verify|confirm|activate|token|validate)[^"']*)["']/gi,
    // Plain text URLs
    /(https?:\/\/[^\s<>"']*myworkdayjobs\.com[^\s<>"']*(?:verify|confirm|activate|token|validate)[^\s<>"']*)/gi,
    /(https?:\/\/[^\s<>"']*workday\.com[^\s<>"']*(?:verify|confirm|activate|token|validate)[^\s<>"']*)/gi,
    // Broader: any link in a Workday email that looks like a verification CTA
    /href=["'](https?:\/\/[^"']*myworkdayjobs\.com[^"']{20,})["']/gi,
    /href=["'](https?:\/\/[^"']*workday\.com\/[^"']{20,})["']/gi,
  ]

  for (const pattern of linkPatterns) {
    const match = pattern.exec(body)
    if (match?.[1]) {
      // Decode HTML entities
      return match[1].replace(/&amp;/g, '&')
    }
  }

  return null
}
