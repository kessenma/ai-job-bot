import { createServerFn } from '@tanstack/react-start'
import { db, schema } from '@job-app-bot/db'
import { inArray, eq, and, isNotNull } from 'drizzle-orm'
import { deleteFile, listFilesWithText, saveFile, type UploadCategory } from './uploads.server.ts'
import type { FileInfo } from './uploads.server.ts'
import { importGoogleDoc, createSampleDoc } from './docs.server.ts'
import { getAuthenticatedClient, isAuthenticated } from './gmail.server.ts'
import { google } from 'googleapis'
import { loadWorkspaceConfig, listDriveFiles, uploadFileToDrive } from './drive-workspace.server.ts'

const LLM_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8083'

async function tryEmbedAndStore(uploadName: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${LLM_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return false
    const { embedding, model } = (await res.json()) as {
      embedding: number[]
      model: string
      dimensions: number
    }
    const embeddingJson = JSON.stringify(embedding)
    await db
      .insert(schema.documentEmbeddings)
      .values({ uploadName, embedding: embeddingJson, model })
      .onConflictDoUpdate({
        target: schema.documentEmbeddings.uploadName,
        set: { embedding: embeddingJson, model, embeddedAt: new Date().toISOString() },
      })
    return true
  } catch {
    return false
  }
}

async function getEmbeddedNames(uploadNames: string[]): Promise<Set<string>> {
  if (uploadNames.length === 0) return new Set()
  const rows = await db
    .select({ uploadName: schema.documentEmbeddings.uploadName })
    .from(schema.documentEmbeddings)
    .where(inArray(schema.documentEmbeddings.uploadName, uploadNames))
  return new Set(rows.map((r) => r.uploadName))
}

export const getResumes = createServerFn({ method: 'GET' }).handler(async () => {
  const files = await listFilesWithText('resume')
  const embedded = await getEmbeddedNames(files.map((f) => f.name))
  return files.map((f) => ({ ...f, embedded: embedded.has(f.name) })) as FileInfo[]
})

export const uploadResume = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string; base64Data: string }) => data)
  .handler(async ({ data }) => {
    const file = await saveFile('resume', data.fileName, data.base64Data)
    const embedded = file.extractedText
      ? await tryEmbedAndStore(file.name, file.extractedText)
      : false
    return { ...file, embedded } as FileInfo
  })

export const importResumeFromDocs = createServerFn({ method: 'POST' })
  .inputValidator((data: { docUrl: string }) => data)
  .handler(async ({ data }) => {
    const { pdfBase64, plainText, title } = await importGoogleDoc(data.docUrl)
    const fileName = `${title.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`
    const file = await saveFile('resume', fileName, pdfBase64)

    // Overwrite extracted text with Drive API's plain text (cleaner than pdf-parse round-trip)
    if (plainText) {
      await db
        .update(schema.uploads)
        .set({ extractedText: plainText })
        .where(eq(schema.uploads.name, file.name))
    }

    const embedded = plainText
      ? await tryEmbedAndStore(file.name, plainText)
      : false
    return { ...file, extractedText: plainText || file.extractedText, embedded } as FileInfo
  })

export const removeResume = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string }) => data)
  .handler(async ({ data }) => {
    deleteFile('resume', data.fileName)
    await db
      .delete(schema.documentEmbeddings)
      .where(eq(schema.documentEmbeddings.uploadName, data.fileName))
      .catch(() => {})
    return true
  })

export const setPrimaryResume = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string }) => data)
  .handler(async ({ data }) => {
    const allResumes = await db
      .select({ name: schema.uploads.name })
      .from(schema.uploads)
      .where(eq(schema.uploads.category, 'resume'))
    for (const r of allResumes) {
      await db
        .update(schema.uploads)
        .set({ isPrimary: r.name === data.fileName })
        .where(eq(schema.uploads.name, r.name))
    }
    return { ok: true }
  })

export const getCoverLetters = createServerFn({ method: 'GET' }).handler(async () => {
  const files = await listFilesWithText('cover-letter')
  const embedded = await getEmbeddedNames(files.map((f) => f.name))
  return files.map((f) => ({ ...f, embedded: embedded.has(f.name) })) as FileInfo[]
})

export const setPrimaryCoverLetter = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string }) => data)
  .handler(async ({ data }) => {
    // Toggle favorite status for the given cover letter (multi-select, not exclusive)
    const [current] = await db
      .select({ isPrimary: schema.uploads.isPrimary })
      .from(schema.uploads)
      .where(eq(schema.uploads.name, data.fileName))
    await db
      .update(schema.uploads)
      .set({ isPrimary: !current?.isPrimary })
      .where(eq(schema.uploads.name, data.fileName))
    return { ok: true }
  })

export const uploadCoverLetter = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string; base64Data: string }) => data)
  .handler(async ({ data }) => {
    const file = await saveFile('cover-letter', data.fileName, data.base64Data)
    const embedded = file.extractedText
      ? await tryEmbedAndStore(file.name, file.extractedText)
      : false

    // Push to Drive Samples folder if workspace is configured
    const config = loadWorkspaceConfig()
    const samplesFolderId = config?.coverLetterSamplesFolderId ?? config?.coverLettersFolderId
    if (samplesFolderId) {
      try {
        const buffer = Buffer.from(data.base64Data, 'base64')
        const ext = data.fileName.substring(data.fileName.lastIndexOf('.')).toLowerCase()
        const mimeMap: Record<string, string> = { '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
        const { id: driveFileId } = await uploadFileToDrive(samplesFolderId, data.fileName, buffer, mimeMap[ext] || 'application/octet-stream')
        await db
          .update(schema.uploads)
          .set({ driveFileId })
          .where(eq(schema.uploads.name, file.name))
        return { ...file, embedded, driveFileId } as FileInfo
      } catch (e) {
        console.warn('Failed to push cover letter to Drive:', e)
      }
    }

    return { ...file, embedded } as FileInfo
  })

export const uploadCoverLetterText = createServerFn({ method: 'POST' })
  .inputValidator((data: { title: string; text: string }) => data)
  .handler(async ({ data }) => {
    if (!data.text.trim()) throw new Error('Cover letter text is required')
    const title = data.title.trim() || 'Cover Letter Sample'
    const fileName = `${title.replace(/[^a-zA-Z0-9._-]/g, '_')}.txt`
    const base64 = Buffer.from(data.text, 'utf-8').toString('base64')
    const file = await saveFile('cover-letter', fileName, base64)

    // Override extracted text with the raw input (cleaner than txt extraction)
    await db
      .update(schema.uploads)
      .set({ extractedText: data.text })
      .where(eq(schema.uploads.name, file.name))

    const embedded = await tryEmbedAndStore(file.name, data.text)

    // Push to Drive Samples folder as a Google Doc if workspace is configured
    const config = loadWorkspaceConfig()
    const samplesFolderId = config?.coverLetterSamplesFolderId ?? config?.coverLettersFolderId
    let driveFileId: string | undefined
    if (samplesFolderId) {
      try {
        const { docId } = await createSampleDoc(title, data.text)
        driveFileId = docId
        await db
          .update(schema.uploads)
          .set({ driveFileId: docId })
          .where(eq(schema.uploads.name, file.name))
      } catch (e) {
        console.warn('Failed to create sample doc in Drive:', e)
      }
    }

    return { ...file, extractedText: data.text, embedded, driveFileId } as FileInfo
  })

export const importCoverLetterFromDocsUrl = createServerFn({ method: 'POST' })
  .inputValidator((data: { docUrl: string }) => data)
  .handler(async ({ data }) => {
    const { pdfBase64, plainText, title } = await importGoogleDoc(data.docUrl)
    const fileName = `${title.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`
    const file = await saveFile('cover-letter', fileName, pdfBase64)

    if (plainText) {
      await db
        .update(schema.uploads)
        .set({ extractedText: plainText })
        .where(eq(schema.uploads.name, file.name))
    }

    const embedded = plainText ? await tryEmbedAndStore(file.name, plainText) : false
    return { ...file, extractedText: plainText || file.extractedText, embedded } as FileInfo
  })

export const importCoverLetterFromDrive = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileId: string; fileName: string; mimeType: string }) => data)
  .handler(async ({ data }) => {
    return importDriveFile('cover-letter', data.fileId, data.fileName, data.mimeType)
  })

export const getDocumentDetails = createServerFn({ method: 'GET' })
  .inputValidator((data: { uploadName: string }) => data)
  .handler(async ({ data }) => {
    const [upload] = await db
      .select()
      .from(schema.uploads)
      .where(eq(schema.uploads.name, data.uploadName))
    if (!upload) return null

    const [embeddingRow] = await db
      .select()
      .from(schema.documentEmbeddings)
      .where(eq(schema.documentEmbeddings.uploadName, data.uploadName))

    return {
      name: upload.name,
      originalName: upload.originalName,
      extractedText: upload.extractedText ?? null,
      uploadedAt: upload.uploadedAt,
      embedding: embeddingRow
        ? {
            model: embeddingRow.model,
            embeddedAt: embeddingRow.embeddedAt,
            dimensions: (JSON.parse(embeddingRow.embedding) as number[]).length,
            vector: JSON.parse(embeddingRow.embedding) as number[],
          }
        : null,
    }
  })

export const getAllDocuments = createServerFn({ method: 'GET' }).handler(async () => {
  const files = await db.select().from(schema.uploads)
  const embedded = await getEmbeddedNames(files.map((f) => f.name))
  return files.map((f) => ({
    name: f.name,
    originalName: f.originalName,
    category: f.category,
    hasText: !!f.extractedText,
    embedded: embedded.has(f.name),
  }))
})

export const getPickerToken = createServerFn({ method: 'GET' }).handler(async () => {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }
  const client = getAuthenticatedClient()
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Failed to get access token')
  return {
    accessToken: token,
    clientId: process.env.GOOGLE_CLIENT_ID!,
  }
})

/** Shared helper: import a Drive file as a local upload with embedding */
async function importDriveFile(
  category: UploadCategory,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<FileInfo> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  // Google Docs: export as PDF + plain text
  if (mimeType === 'application/vnd.google-apps.document') {
    const docUrl = `https://docs.google.com/document/d/${fileId}`
    const { pdfBase64, plainText, title } = await importGoogleDoc(docUrl)
    const safeName = `${title.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`
    const file = await saveFile(category, safeName, pdfBase64, { driveFileId: fileId, mimeType })
    if (plainText) {
      await db
        .update(schema.uploads)
        .set({ extractedText: plainText })
        .where(eq(schema.uploads.name, file.name))
    }
    const embedded = plainText ? await tryEmbedAndStore(file.name, plainText) : false
    return { ...file, extractedText: plainText || file.extractedText, embedded } as FileInfo
  }

  // Regular files (PDF, DOCX): download directly from Drive
  const auth = getAuthenticatedClient()
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  )
  const base64 = Buffer.from(res.data as ArrayBuffer).toString('base64')
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const file = await saveFile(category, safeName, base64, { driveFileId: fileId, mimeType })
  const embedded = file.extractedText ? await tryEmbedAndStore(file.name, file.extractedText) : false
  return { ...file, embedded } as FileInfo
}

export const importResumeFromDrive = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileId: string; fileName: string; mimeType: string }) => data)
  .handler(async ({ data }) => {
    return importDriveFile('resume', data.fileId, data.fileName, data.mimeType)
  })

export const getDriveFilePreview = createServerFn({ method: 'GET' })
  .inputValidator((data: { fileId: string; mimeType: string }) => data)
  .handler(async ({ data }) => {
    if (!isAuthenticated()) {
      throw new Error('Google account not connected.')
    }

    const auth = getAuthenticatedClient()
    const drive = google.drive({ version: 'v3', auth })

    // Google Docs: export as HTML for rich preview + plain text
    if (data.mimeType === 'application/vnd.google-apps.document') {
      const [htmlRes, textRes] = await Promise.all([
        drive.files.export({ fileId: data.fileId, mimeType: 'text/html' }),
        drive.files.export({ fileId: data.fileId, mimeType: 'text/plain' }),
      ])
      return {
        html: typeof htmlRes.data === 'string' ? htmlRes.data : String(htmlRes.data),
        text: (typeof textRes.data === 'string' ? textRes.data : String(textRes.data)).trim(),
      }
    }

    // Google Sheets: export as HTML
    if (data.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const htmlRes = await drive.files.export({ fileId: data.fileId, mimeType: 'text/html' })
      return {
        html: typeof htmlRes.data === 'string' ? htmlRes.data : String(htmlRes.data),
        text: null,
      }
    }

    // PDF / DOCX etc: download and extract text if possible
    // For now just return null — these files can be imported and viewed via DocumentViewerModal
    return { html: null, text: null }
  })

export const reEmbed = createServerFn({ method: 'POST' })
  .inputValidator((data: { uploadName: string }) => data)
  .handler(async ({ data }) => {
    const [upload] = await db
      .select({ extractedText: schema.uploads.extractedText })
      .from(schema.uploads)
      .where(eq(schema.uploads.name, data.uploadName))
    if (!upload?.extractedText) {
      throw new Error('No extracted text available for this document')
    }
    const success = await tryEmbedAndStore(data.uploadName, upload.extractedText)
    if (!success) {
      throw new Error('Embedding failed — is the LLM service running?')
    }
    return { embedded: true }
  })

export const removeCoverLetter = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string }) => data)
  .handler(async ({ data }) => {
    deleteFile('cover-letter', data.fileName)
    await db
      .delete(schema.documentEmbeddings)
      .where(eq(schema.documentEmbeddings.uploadName, data.fileName))
      .catch(() => {})
    return true
  })

/** Batch-sync Drive files into local uploads for a given category */
async function syncDriveFiles(
  category: UploadCategory,
  driveFiles: { id: string; name: string; mimeType: string }[],
): Promise<{ imported: FileInfo[]; skipped: number; embedFailures: string[] }> {
  // Get already-synced Drive file IDs
  const existing = await db
    .select({ driveFileId: schema.uploads.driveFileId })
    .from(schema.uploads)
    .where(and(eq(schema.uploads.category, category), isNotNull(schema.uploads.driveFileId)))
  const syncedIds = new Set(existing.map((r) => r.driveFileId))

  // Filter out PRIMARY- copies and already-synced files
  const newFiles = driveFiles.filter((f) => !f.name.startsWith('PRIMARY-') && !syncedIds.has(f.id))

  const imported: FileInfo[] = []
  const embedFailures: string[] = []

  for (const df of newFiles) {
    try {
      const file = await importDriveFile(category, df.id, df.name, df.mimeType)
      imported.push(file)
      if (file.embedded === false) {
        embedFailures.push(df.name)
      }
    } catch (e) {
      console.warn(`Failed to sync Drive file ${df.name}:`, e)
      embedFailures.push(df.name)
    }
  }

  return { imported, skipped: driveFiles.length - newFiles.length, embedFailures }
}

export const syncResumesFromDrive = createServerFn({ method: 'POST' })
  .handler(async () => {
    const config = loadWorkspaceConfig()
    if (!config) return { imported: [], skipped: 0, embedFailures: [] }
    const files = await listDriveFiles(config.resumesFolderId)
    return syncDriveFiles('resume', files)
  })

export const syncCoverLettersFromDrive = createServerFn({ method: 'POST' })
  .handler(async () => {
    const config = loadWorkspaceConfig()
    if (!config) return { imported: [], skipped: 0, embedFailures: [] }
    const folderId = config.coverLetterSamplesFolderId ?? config.coverLettersFolderId
    const files = await listDriveFiles(folderId)
    return syncDriveFiles('cover-letter', files)
  })
