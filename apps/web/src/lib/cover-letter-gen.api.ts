import { createServerFn } from '@tanstack/react-start'
import { db, schema } from '@job-app-bot/db'
import { eq, desc, and } from 'drizzle-orm'
import { generateCoverLetter } from './llm.api.ts'
import { createCoverLetterDoc } from './docs.server.ts'
import { saveFile } from './uploads.server.ts'

const PLAYWRIGHT_URL = process.env.PLAYWRIGHT_SERVICE_URL || 'http://localhost:8084'

export type GeneratedCoverLetter = typeof schema.generatedCoverLetters.$inferSelect

export type ScrapeResult = {
  text: string
  title: string | null
  url: string
  company: string | null
  jobTitle: string | null
  location: string | null
  timeMs: number
}

export const scrapeJobForCoverLetter = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string; sessionId?: string }) => data)
  .handler(async ({ data }) => {
    const res = await fetch(`${PLAYWRIGHT_URL}/scrape-description`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: data.url, sessionId: data.sessionId }),
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) throw new Error('Failed to scrape job posting')
    const result = (await res.json()) as ScrapeResult
    if (!result.text || result.text.length < 20) {
      throw new Error('Could not extract job description from this page')
    }

    // Parse company/role from page title as fallback
    if (!result.company && !result.jobTitle && result.title) {
      const separators = [' at ', ' - ', ' | ', ' — ', ' – ']
      for (const sep of separators) {
        if (result.title.includes(sep)) {
          const parts = result.title.split(sep).map((s) => s.trim())
          if (parts.length >= 2) {
            if (sep === ' at ') {
              result.jobTitle = result.jobTitle || parts[0]
              result.company = result.company || parts[1]
            } else {
              result.company = result.company || parts[0]
              result.jobTitle = result.jobTitle || parts[1]
            }
          }
          break
        }
      }
    }

    return result
  })

export const generateAndSaveCoverLetter = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      jobUrl?: string
      company: string
      role: string
      jobDescription: string
      location?: string
      style: 'classic' | 'modern'
      sampleNames?: string[]
    }) => data,
  )
  .handler(async ({ data }) => {
    const result = await generateCoverLetter({
      data: {
        company: data.company,
        role: data.role,
        jobDescription: data.jobDescription,
        location: data.location,
        candidateName: '', // filled from resume by server
        style: data.style,
        sampleNames: data.sampleNames,
      },
    })

    const [row] = await db
      .insert(schema.generatedCoverLetters)
      .values({
        jobUrl: data.jobUrl || null,
        company: data.company,
        role: data.role,
        location: data.location || null,
        scrapedDescription: data.jobDescription || null,
        style: data.style,
        content: result.coverLetter,
        modelUsed: result.modelUsed || null,
        generationTimeS: String(result.generationTime),
      })
      .returning()

    // Save locally as a file so other processes (auto-apply) can reference it
    const fileName = `CL_${data.company}_${data.role}.txt`.replace(/[^a-zA-Z0-9._-]/g, '_')
    const base64Content = Buffer.from(result.coverLetter, 'utf-8').toString('base64')
    const upload = await saveFile('generated-cover-letter', fileName, base64Content)

    // Link to job if we have a URL
    if (data.jobUrl) {
      await db
        .insert(schema.jobCoverLetters)
        .values({ jobUrl: data.jobUrl, uploadName: upload.name })
        .onConflictDoUpdate({
          target: schema.jobCoverLetters.jobUrl,
          set: { uploadName: upload.name, createdAt: new Date().toISOString() },
        })
    }

    return { ...row, generationTime: result.generationTime, uploadName: upload.name }
  })

export const saveCoverLetterToDrive = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; uploadName?: string }) => data)
  .handler(async ({ data }) => {
    const [letter] = await db
      .select()
      .from(schema.generatedCoverLetters)
      .where(eq(schema.generatedCoverLetters.id, data.id))

    if (!letter) throw new Error('Cover letter not found')

    const title = `Cover Letter - ${letter.company} - ${letter.role}`
    const { docId, docUrl } = await createCoverLetterDoc(title, letter.content)

    await db
      .update(schema.generatedCoverLetters)
      .set({ driveDocId: docId, driveUrl: docUrl })
      .where(eq(schema.generatedCoverLetters.id, data.id))

    // Keep the local uploads row in sync with the Drive file
    if (data.uploadName) {
      await db
        .update(schema.uploads)
        .set({ driveFileId: docId })
        .where(eq(schema.uploads.name, data.uploadName))
    }

    return { docId, docUrl }
  })

export const getGeneratedLetters = createServerFn({ method: 'GET' })
  .inputValidator((data: { jobUrl?: string }) => data)
  .handler(async ({ data }) => {
    if (data.jobUrl) {
      return db
        .select()
        .from(schema.generatedCoverLetters)
        .where(eq(schema.generatedCoverLetters.jobUrl, data.jobUrl))
        .orderBy(desc(schema.generatedCoverLetters.createdAt))
    }
    return db
      .select()
      .from(schema.generatedCoverLetters)
      .orderBy(desc(schema.generatedCoverLetters.createdAt))
  })

export const saveGeneratedAsSample = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const [letter] = await db
      .select()
      .from(schema.generatedCoverLetters)
      .where(eq(schema.generatedCoverLetters.id, data.id))
    if (!letter) throw new Error('Cover letter not found')

    const title = `${letter.company} - ${letter.role}`
    const fileName = `${title.replace(/[^a-zA-Z0-9._-]/g, '_')}.txt`

    // Prevent duplicates — check if this generated letter was already saved as a sample
    const [existing] = await db
      .select()
      .from(schema.uploads)
      .where(and(eq(schema.uploads.category, 'cover-letter'), eq(schema.uploads.originalName, fileName)))
    if (existing) return { ...existing, embedded: existing.extractedText ? true : false }

    const base64 = Buffer.from(letter.content, 'utf-8').toString('base64')
    const file = await saveFile('cover-letter', fileName, base64)

    // Set extracted text directly (cleaner than txt extraction)
    await db
      .update(schema.uploads)
      .set({ extractedText: letter.content, isPrimary: true })
      .where(eq(schema.uploads.name, file.name))

    return { ...file, extractedText: letter.content, isPrimary: true, embedded: false }
  })

export const updateGeneratedLetter = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; content: string }) => data)
  .handler(async ({ data }) => {
    const [updated] = await db
      .update(schema.generatedCoverLetters)
      .set({ content: data.content })
      .where(eq(schema.generatedCoverLetters.id, data.id))
      .returning()
    if (!updated) throw new Error('Cover letter not found')
    return updated
  })

export const deleteGeneratedLetter = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    await db
      .delete(schema.generatedCoverLetters)
      .where(eq(schema.generatedCoverLetters.id, data.id))
    return { ok: true }
  })

export const exportCoverLetterPdf = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const [letter] = await db
      .select()
      .from(schema.generatedCoverLetters)
      .where(eq(schema.generatedCoverLetters.id, data.id))
    if (!letter) throw new Error('Cover letter not found')

    // If it's saved to Drive, export the Google Doc as PDF
    if (letter.driveDocId) {
      const { exportDocAsPdf } = await import('./docs.server.ts')
      const pdfBase64 = await exportDocAsPdf(letter.driveDocId)
      return { pdfBase64, fileName: `Cover Letter - ${letter.company} - ${letter.role}.pdf` }
    }

    // Otherwise, create a temporary Google Doc, export as PDF, then delete it
    const title = `Cover Letter - ${letter.company} - ${letter.role}`
    const { docId, docUrl: _ } = await createCoverLetterDoc(title, letter.content)
    const { exportDocAsPdf } = await import('./docs.server.ts')
    const pdfBase64 = await exportDocAsPdf(docId)

    // Clean up the temporary doc
    const { google } = await import('googleapis')
    const { getAuthenticatedClient } = await import('./gmail.server.ts')
    const auth = getAuthenticatedClient()
    const drive = google.drive({ version: 'v3', auth })
    await drive.files.delete({ fileId: docId }).catch(() => {})

    return { pdfBase64, fileName: `${title}.pdf` }
  })
