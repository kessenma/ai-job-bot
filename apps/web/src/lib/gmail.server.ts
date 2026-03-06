import { google } from 'googleapis'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const TOKEN_PATH = resolve(process.cwd(), 'uploads', '.gmail-token.json')

// Keywords that signal a rejection email
const REJECTION_KEYWORDS = [
  'unfortunately',
  'regret to inform',
  'regret',
  'will not be moving forward',
  'won\'t be moving forward',
  'aren\'t moving forward',
  'are not moving forward',
  'not be proceeding',
  'decided not to proceed',
  'not to move forward',
  'other candidates',
  'decided to go with',
  'move forward with other',
  'pursuing other candidates',
  'not the right fit',
  'not a match',
  'unable to offer',
  'will not be offering',
  'position has been filled',
  'after careful consideration',
  'we have decided to',
  'not selected',
  'did not select',
  'we will not',
  'we won\'t',
  'your application was not',
  'your application has not been',
  'thank you for your interest, however',
  'at this time we',
  'not able to move',
]

// Keywords that signal an interview/positive response
const INTERVIEW_KEYWORDS = [
  'schedule an interview',
  'schedule a call',
  'invite you to interview',
  'like to invite you',
  'would love to chat',
  'meet with our team',
  'technical interview',
  'coding challenge',
  'take-home assignment',
  'phone screen',
  'video interview',
  'meet the team',
  'would like to discuss your',
  'move forward with your',
  'moving forward with you',
  'pleased to inform',
  'happy to inform',
  'congratulations',
  'offer letter',
  'we\'d like to proceed',
  'availability for an interview',
  'book a time',
  'calendly',
]

// Keywords that signal an application confirmation/acknowledgment
const APPLICATION_KEYWORDS = [
  'thank you for applying',
  'thanks for applying',
  'thank you for your application',
  'thanks for your application',
  'application received',
  'application has been received',
  'application was received',
  'we have received your application',
  'we received your application',
  'application submitted',
  'application has been submitted',
  'successfully applied',
  'successfully submitted',
  'your application for',
  'confirming your application',
  'confirm your application',
  'application confirmation',
  'thank you for your interest in',
  'thanks for your interest in',
  'thank you for submitting',
  'thanks for submitting',
]

export type EmailClassification = 'rejection' | 'interview' | 'applied' | 'other'

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
      'https://www.googleapis.com/auth/spreadsheets.readonly',
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

function classifyEmail(subject: string, snippet: string, body?: string): {
  classification: EmailClassification
  matchedKeywords: string[]
} {
  const text = `${subject} ${snippet} ${body ?? ''}`.toLowerCase()
  const matchedRejection: string[] = []
  const matchedInterview: string[] = []
  const matchedApplied: string[] = []

  for (const kw of REJECTION_KEYWORDS) {
    if (text.includes(kw)) matchedRejection.push(kw)
  }
  for (const kw of INTERVIEW_KEYWORDS) {
    if (text.includes(kw)) matchedInterview.push(kw)
  }
  for (const kw of APPLICATION_KEYWORDS) {
    if (text.includes(kw)) matchedApplied.push(kw)
  }

  // Priority: rejection > interview > applied > other
  // Rejection keywords are strongest signal
  if (matchedRejection.length > 0 && matchedRejection.length >= matchedInterview.length) {
    return { classification: 'rejection', matchedKeywords: matchedRejection }
  }
  // If both interview and applied match, check if it's really just an
  // application confirmation that happens to contain generic words like
  // "next steps" or "assessment". Applied keywords are more specific,
  // so if applied matches, prefer it unless there are strong interview signals.
  if (matchedInterview.length > 0 && matchedApplied.length === 0) {
    return { classification: 'interview', matchedKeywords: matchedInterview }
  }
  if (matchedApplied.length > 0) {
    // If there are also interview keywords but more applied keywords,
    // it's likely an application confirmation mentioning generic terms
    if (matchedInterview.length > matchedApplied.length) {
      return { classification: 'interview', matchedKeywords: matchedInterview }
    }
    return { classification: 'applied', matchedKeywords: matchedApplied }
  }
  return { classification: 'other', matchedKeywords: [] }
}

// Common legal suffixes that add noise to Gmail search
const COMPANY_SUFFIXES = /\b(gmbh|inc\.?|llc|ltd\.?|ag|se|co\.?|corp\.?|plc|s\.?a\.?|b\.?v\.?|n\.?v\.?|pty|e\.?v\.?|kg|ohg|ug)\b/gi

function cleanCompanyName(name: string): string {
  return name.replace(COMPANY_SUFFIXES, '').replace(/[.,]+$/, '').trim()
}

function emailMatchesCompany(from: string, subject: string, snippet: string, companyName: string): boolean {
  const cleaned = cleanCompanyName(companyName).toLowerCase()
  const text = `${from} ${subject} ${snippet}`.toLowerCase()

  // Check if the cleaned company name appears in the email metadata
  // Use word-boundary-aware matching for short names
  if (cleaned.length <= 3) {
    // Very short names need exact word match
    const regex = new RegExp(`\\b${cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    return regex.test(text)
  }

  return text.includes(cleaned)
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

export function disconnectGmail(): void {
  if (existsSync(TOKEN_PATH)) {
    unlinkSync(TOKEN_PATH)
  }
}
