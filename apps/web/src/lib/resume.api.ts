import { createServerFn } from '@tanstack/react-start'
import { db, schema } from '@job-app-bot/db'
import { inArray, eq, and } from 'drizzle-orm'
import { deleteFile, listFiles, listFilesWithText, saveFile } from './uploads.server.ts'
import type { FileInfo } from './uploads.server.ts'

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

export const getResume = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = await listFilesWithText('resume')
  if (rows.length === 0) return null
  const file = rows[0]
  const embedded = await getEmbeddedNames([file.name])
  return { ...file, embedded: embedded.has(file.name) } as FileInfo
})

export const uploadResume = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string; base64Data: string }) => data)
  .handler(async ({ data }) => {
    const file = await saveFile('resume', data.fileName, data.base64Data, { replaceAll: true })
    const embedded = file.extractedText
      ? await tryEmbedAndStore(file.name, file.extractedText)
      : false
    return { ...file, embedded } as FileInfo
  })

export const removeResume = createServerFn({ method: 'POST' }).handler(async () => {
  const files = listFiles('resume')
  for (const f of files) {
    deleteFile('resume', f.name)
    await db
      .delete(schema.documentEmbeddings)
      .where(eq(schema.documentEmbeddings.uploadName, f.name))
      .catch(() => {})
  }
  return true
})

export const getCoverLetters = createServerFn({ method: 'GET' }).handler(async () => {
  const files = await listFilesWithText('cover-letter')
  const embedded = await getEmbeddedNames(files.map((f) => f.name))
  return files.map((f) => ({ ...f, embedded: embedded.has(f.name) })) as FileInfo[]
})

export const uploadCoverLetter = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string; base64Data: string }) => data)
  .handler(async ({ data }) => {
    const file = await saveFile('cover-letter', data.fileName, data.base64Data)
    const embedded = file.extractedText
      ? await tryEmbedAndStore(file.name, file.extractedText)
      : false
    return { ...file, embedded } as FileInfo
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
