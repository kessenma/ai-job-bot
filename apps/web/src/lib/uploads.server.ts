import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { db, schema } from '@job-app-bot/db'
import { eq, and, inArray } from 'drizzle-orm'

const DATA_DIR = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const UPLOADS_DIR = resolve(DATA_DIR, 'uploads')

export type UploadCategory = 'resume' | 'cover-letter'

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx']

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
  options?: { replaceAll?: boolean },
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

  let safeName: string
  if (category === 'resume') {
    safeName = `resume${ext}`
  } else {
    const base = fileName
      .substring(0, fileName.lastIndexOf('.'))
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 80)
    const timestamp = Date.now()
    safeName = `${base}_${timestamp}${ext}`
  }

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
    })
    .onConflictDoUpdate({
      target: schema.uploads.name,
      set: { originalName: fileName, extractedText, uploadedAt: new Date().toISOString() },
    })

  return {
    path: filePath,
    name: safeName,
    originalName: fileName,
    uploadedAt: new Date().toISOString(),
    extractedText: extractedText ?? undefined,
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
  }))
}

export async function readCoverLetterTexts(): Promise<string[]> {
  const rows = await db
    .select({ extractedText: schema.uploads.extractedText })
    .from(schema.uploads)
    .where(and(eq(schema.uploads.category, 'cover-letter')))

  return rows.flatMap((r) => (r.extractedText ? [r.extractedText] : []))
}

export async function readResumeText(): Promise<string> {
  const rows = await db
    .select({ extractedText: schema.uploads.extractedText })
    .from(schema.uploads)
    .where(eq(schema.uploads.category, 'resume'))

  return rows[0]?.extractedText ?? ''
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
