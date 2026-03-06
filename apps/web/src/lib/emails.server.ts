import { db, schema } from '@job-app-bot/db'
import { ensureDb } from '@job-app-bot/db/init'
import type { ScannedEmail, ScanResult, EmailClassification } from './gmail.server.ts'

export function saveScannedEmails(results: ScanResult[]): void {
  ensureDb()
  for (const result of results) {
    for (const email of result.emails) {
      db.insert(schema.scannedEmails)
        .values({
          messageId: email.messageId,
          company: result.company,
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
  }
}

export function loadSavedEmails(): ScanResult[] {
  ensureDb()
  const rows = db.select().from(schema.scannedEmails).all()

  const byCompany = new Map<string, ScannedEmail[]>()
  for (const row of rows) {
    const emails = byCompany.get(row.company) ?? []
    emails.push({
      messageId: row.messageId,
      from: row.from ?? '',
      subject: row.subject ?? '',
      snippet: row.snippet ?? '',
      date: row.date ?? '',
      classification: (row.classification as EmailClassification) ?? 'other',
      matchedKeywords: row.matchedKeywords ? JSON.parse(row.matchedKeywords) : [],
    })
    byCompany.set(row.company, emails)
  }

  const results: ScanResult[] = []
  for (const [company, emails] of byCompany) {
    const rejections = emails.filter((e) => e.classification === 'rejection')
    const interviews = emails.filter((e) => e.classification === 'interview')
    const applied = emails.filter((e) => e.classification === 'applied')
    let suggestedStatus: EmailClassification | null = null
    if (applied.length > 0) suggestedStatus = 'applied'
    if (rejections.length > 0) suggestedStatus = 'rejection'
    if (interviews.length > 0) suggestedStatus = 'interview'
    results.push({ company, emails, suggestedStatus })
  }

  return results
}

export function getSavedEmailCount(): number {
  ensureDb()
  const result = db.select().from(schema.scannedEmails).all()
  return result.length
}
