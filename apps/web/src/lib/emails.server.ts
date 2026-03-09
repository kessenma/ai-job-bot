import { db, schema } from '@job-app-bot/db'
import { ensureDb } from '@job-app-bot/db/init'
import type { ScannedEmail, ScanResult, EmailClassification } from './gmail.server.ts'

export async function saveScannedEmails(results: ScanResult[]): Promise<void> {
  await ensureDb()
  for (const result of results) {
    for (const email of result.emails) {
      await db.insert(schema.scannedEmails)
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
    }
  }
}

export async function loadSavedEmails(): Promise<ScanResult[]> {
  await ensureDb()
  const rows = await db.select().from(schema.scannedEmails)

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

export async function getSavedEmailCount(): Promise<number> {
  await ensureDb()
  const result = await db.select().from(schema.scannedEmails)
  return result.length
}
