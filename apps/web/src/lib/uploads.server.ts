import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { db, schema } from '@job-app-bot/db'
import { eq, and, inArray } from 'drizzle-orm'

const DATA_DIR = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const UPLOADS_DIR = resolve(DATA_DIR, 'uploads')

export type UploadCategory = 'resume' | 'cover-letter' | 'generated-cover-letter'

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt']

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
}

function categoryDir(category: UploadCategory): string {
  const dir = resolve(UPLOADS_DIR, category)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export interface FileInfo {
  path: string
  name: string
  originalName: string
  uploadedAt: string
  extractedText?: string
  embedded?: boolean
  isPrimary?: boolean
  driveFileId?: string
  mimeType?: string
}

async function extractText(filePath: string, ext: string): Promise<string | null> {
  try {
    if (ext === '.pdf') {
      const pdfParse = (await import('pdf-parse')).default
      const buffer = readFileSync(filePath)
      const data = await pdfParse(buffer)
      return data.text.trim() || null
    }

    if (ext === '.docx' || ext === '.doc') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      return result.value.trim() || null
    }
  } catch (err) {
    console.warn(`Text extraction failed for ${filePath}:`, err)
  }
  return null
}

export async function saveFile(
  category: UploadCategory,
  fileName: string,
  base64Data: string,
  options?: { replaceAll?: boolean; driveFileId?: string; mimeType?: string },
): Promise<FileInfo> {
  const dir = categoryDir(category)
  const ext = extname(fileName).toLowerCase()

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Invalid file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`)
  }

  if (options?.replaceAll) {
    const existing = readdirSync(dir).filter((f) =>
      ALLOWED_EXTENSIONS.some((e) => f.endsWith(e)),
    )
    for (const f of existing) {
      unlinkSync(resolve(dir, f))
    }
    // Remove old DB records for this category
    await db.delete(schema.uploads).where(eq(schema.uploads.category, category))
  }

  const base = fileName
    .substring(0, fileName.lastIndexOf('.'))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 80)
  const timestamp = Date.now()
  const safeName = `${base}_${timestamp}${ext}`

  const filePath = resolve(dir, safeName)
  const buffer = Buffer.from(base64Data, 'base64')
  writeFileSync(filePath, buffer)

  const extractedText = await extractText(filePath, ext)

  await db
    .insert(schema.uploads)
    .values({
      category,
      name: safeName,
      originalName: fileName,
      extractedText,
      driveFileId: options?.driveFileId,
      mimeType: options?.mimeType ?? EXT_TO_MIME[ext],
    })
    .onConflictDoUpdate({
      target: schema.uploads.name,
      set: { originalName: fileName, extractedText, uploadedAt: new Date().toISOString(), driveFileId: options?.driveFileId, mimeType: options?.mimeType ?? EXT_TO_MIME[ext] },
    })

  const resolvedMimeType = options?.mimeType ?? EXT_TO_MIME[ext]
  return {
    path: filePath,
    name: safeName,
    originalName: fileName,
    uploadedAt: new Date().toISOString(),
    extractedText: extractedText ?? undefined,
    driveFileId: options?.driveFileId,
    mimeType: resolvedMimeType,
  }
}

export function listFiles(category: UploadCategory): FileInfo[] {
  const dir = categoryDir(category)
  const files = readdirSync(dir).filter((f) =>
    ALLOWED_EXTENSIONS.some((e) => f.endsWith(e)),
  )
  return files.map((f) => {
    const filePath = resolve(dir, f)
    const stat = statSync(filePath)
    return {
      path: filePath,
      name: f,
      originalName: f,
      uploadedAt: stat.mtime.toISOString(),
    }
  })
}

export async function listFilesWithText(category: UploadCategory): Promise<FileInfo[]> {
  const rows = await db
    .select()
    .from(schema.uploads)
    .where(eq(schema.uploads.category, category))

  const dir = categoryDir(category)
  return rows.map((row) => ({
    path: resolve(dir, row.name),
    name: row.name,
    originalName: row.originalName,
    uploadedAt: row.uploadedAt,
    extractedText: row.extractedText ?? undefined,
    isPrimary: row.isPrimary ?? false,
    driveFileId: row.driveFileId ?? undefined,
    mimeType: row.mimeType ?? undefined,
  }))
}

export async function readCoverLetterTexts(sampleNames?: string[]): Promise<string[]> {
  // If specific samples are requested, return those
  if (sampleNames && sampleNames.length > 0) {
    const rows = await db
      .select({ extractedText: schema.uploads.extractedText })
      .from(schema.uploads)
      .where(and(eq(schema.uploads.category, 'cover-letter'), inArray(schema.uploads.name, sampleNames)))
    return rows.filter((r) => r.extractedText).map((r) => r.extractedText!)
  }

  const rows = await db
    .select({ extractedText: schema.uploads.extractedText, isPrimary: schema.uploads.isPrimary })
    .from(schema.uploads)
    .where(eq(schema.uploads.category, 'cover-letter'))

  const withText = rows.filter((r) => r.extractedText)
  const favorites = withText.filter((r) => r.isPrimary)

  // Use favorites if any are set, otherwise fall back to all samples
  const selected = favorites.length > 0 ? favorites : withText

  // Sort favorites first
  const sorted = selected.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
  return sorted.map((r) => r.extractedText!)
}

export async function readResumeText(): Promise<string> {
  const rows = await db
    .select({ extractedText: schema.uploads.extractedText, isPrimary: schema.uploads.isPrimary })
    .from(schema.uploads)
    .where(eq(schema.uploads.category, 'resume'))

  // Prefer the primary resume, fall back to first available
  const primary = rows.find((r) => r.isPrimary)
  return primary?.extractedText ?? rows[0]?.extractedText ?? ''
}

/** Returns texts for specific resumes by stored filename, concatenated. */
export async function readResumeTextsByName(names: string[]): Promise<string> {
  if (names.length === 0) return ''
  const rows = await db
    .select({ name: schema.uploads.name, originalName: schema.uploads.originalName, extractedText: schema.uploads.extractedText })
    .from(schema.uploads)
    .where(and(eq(schema.uploads.category, 'resume'), inArray(schema.uploads.name, names)))

  const withText = rows.filter((r) => r.extractedText)
  if (withText.length === 0) return ''
  if (withText.length === 1) return withText[0].extractedText!
  return withText.map((r) => `--- ${r.originalName} ---\n${r.extractedText}`).join('\n\n')
}

/** Returns all resume texts concatenated, with the primary resume first. */
export async function readAllResumeTexts(): Promise<string> {
  const rows = await db
    .select({ originalName: schema.uploads.originalName, extractedText: schema.uploads.extractedText, isPrimary: schema.uploads.isPrimary })
    .from(schema.uploads)
    .where(eq(schema.uploads.category, 'resume'))

  const sorted = rows
    .filter((r) => r.extractedText)
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))

  if (sorted.length === 0) return ''
  if (sorted.length === 1) return sorted[0].extractedText!

  return sorted
    .map((r) => `--- ${r.originalName} ---\n${r.extractedText}`)
    .join('\n\n')
}

export async function readDocumentTextsByName(names: string[]): Promise<string | undefined> {
  if (names.length === 0) return undefined
  const rows = await db
    .select({ name: schema.uploads.name, originalName: schema.uploads.originalName, extractedText: schema.uploads.extractedText })
    .from(schema.uploads)
    .where(inArray(schema.uploads.name, names))
  const parts = rows
    .filter((r) => r.extractedText)
    .map((r) => `--- ${r.originalName} ---\n${r.extractedText}`)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

export function deleteFile(category: UploadCategory, fileName: string): boolean {
  const dir = categoryDir(category)
  const filePath = resolve(dir, fileName)
  if (!filePath.startsWith(dir)) {
    throw new Error('Invalid file path')
  }
  if (existsSync(filePath)) {
    unlinkSync(filePath)
    // Fire-and-forget DB cleanup (deleteFile is called from async server fns)
    db.delete(schema.uploads).where(
      and(eq(schema.uploads.category, category), eq(schema.uploads.name, fileName)),
    ).catch((err) => console.warn('DB cleanup failed:', err))
    return true
  }
  return false
}
