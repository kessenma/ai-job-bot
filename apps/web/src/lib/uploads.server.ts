import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'

const UPLOADS_DIR = resolve(process.cwd(), 'uploads')

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
}

export function saveFile(
  category: UploadCategory,
  fileName: string,
  base64Data: string,
  options?: { replaceAll?: boolean },
): FileInfo {
  const dir = categoryDir(category)
  const ext = extname(fileName).toLowerCase()

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Invalid file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`)
  }

  // For resume, replace existing (only keep one). For cover letters, allow multiple.
  if (options?.replaceAll) {
    const existing = readdirSync(dir).filter((f) =>
      ALLOWED_EXTENSIONS.some((e) => f.endsWith(e)),
    )
    for (const f of existing) {
      unlinkSync(resolve(dir, f))
    }
  }

  // Create a safe filename: for resume just "resume.pdf", for cover letters keep original name
  let safeName: string
  if (category === 'resume') {
    safeName = `resume${ext}`
  } else {
    // Sanitize filename: remove non-alphanumeric chars except dots, dashes, underscores
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

  return {
    path: filePath,
    name: safeName,
    originalName: fileName,
    uploadedAt: new Date().toISOString(),
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

export function deleteFile(category: UploadCategory, fileName: string): boolean {
  const dir = categoryDir(category)
  const filePath = resolve(dir, fileName)
  // Prevent path traversal
  if (!filePath.startsWith(dir)) {
    throw new Error('Invalid file path')
  }
  if (existsSync(filePath)) {
    unlinkSync(filePath)
    return true
  }
  return false
}
