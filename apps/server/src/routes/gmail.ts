import { google } from 'googleapis'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyEmail, cleanCompanyName, emailMatchesCompany } from '@job-app-bot/shared/email-classifier'
import type { EmailClassification } from '@job-app-bot/shared/email-classifier'
import { db, schema } from '@job-app-bot/db'

type JsonFn = (data: unknown, status?: number) => Response

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const TOKEN_PATH = resolve(dataDir, '.gmail-token.json')

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

interface ScannedEmail {
  from: string
  subject: string
  snippet: string
  date: string
  classification: EmailClassification
  matchedKeywords: string[]
  messageId: string
}

async function scanEmailsForCompany(companyName: string): Promise<ScannedEmail[]> {
  const auth = getAuthenticatedClient()
  const gmail = google.gmail({ version: 'v1', auth })

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

    if (!emailMatchesCompany(from, subject, snippet, companyName)) continue

    const { classification, matchedKeywords } = classifyEmail(subject, snippet)

    results.push({ from, subject, snippet, date, classification, matchedKeywords, messageId: msg.id! })
  }

  return results
}

export async function handleGmailRoutes(req: Request, url: URL, json: JsonFn): Promise<Response> {
  const path = url.pathname

  if (req.method === 'GET' && path === '/api/gmail/status') {
    const authenticated = existsSync(TOKEN_PATH)
    const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    return json({ configured, authenticated })
  }

  if (req.method === 'POST' && path === '/api/gmail/scan') {
    const body = await req.json() as { companies: string[] }
    const unique = [...new Set(body.companies.map((c: string) => c.trim()).filter(Boolean))]

    const results = []
    for (const company of unique) {
      try {
        const emails = await scanEmailsForCompany(company)
        const rejections = emails.filter((e) => e.classification === 'rejection')
        const interviews = emails.filter((e) => e.classification === 'interview')
        const applied = emails.filter((e) => e.classification === 'applied')

        let suggestedStatus: EmailClassification | null = null
        if (applied.length > 0) suggestedStatus = 'applied'
        if (rejections.length > 0) suggestedStatus = 'rejection'
        if (interviews.length > 0) suggestedStatus = 'interview'

        // Save to database
        for (const email of emails) {
          db.insert(schema.scannedEmails)
            .values({
              messageId: email.messageId,
              company,
              from: email.from,
              subject: email.subject,
              snippet: email.snippet,
              date: email.date,
              classification: email.classification,
              matchedKeywords: JSON.stringify(email.matchedKeywords),
            })
            .onConflictDoUpdate({
              target: schema.scannedEmails.messageId,
              set: {
                classification: email.classification,
                matchedKeywords: JSON.stringify(email.matchedKeywords),
                scannedAt: new Date().toISOString(),
              },
            })
            .run()
        }

        results.push({ company, emails, suggestedStatus })
      } catch (err) {
        console.error(`Failed to scan emails for ${company}:`, err)
        results.push({ company, emails: [], suggestedStatus: null })
      }
    }

    return json(results)
  }

  if (req.method === 'GET' && path === '/api/gmail/emails') {
    const rows = db.select().from(schema.scannedEmails).all()
    return json(rows)
  }

  return json({ error: 'Not found' }, 404)
}
