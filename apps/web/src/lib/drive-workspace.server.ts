import { google } from 'googleapis'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAuthenticatedClient, isAuthenticated } from './gmail.server.ts'

const DATA_DIR = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const WORKSPACE_CONFIG_PATH = resolve(DATA_DIR, 'uploads', '.drive-workspace.json')

const WORKSPACE_FOLDER_NAME = 'ai-job-bot'
const RESUMES_FOLDER_NAME = 'Resumes'
const COVER_LETTERS_FOLDER_NAME = 'Cover Letters'
const COVER_LETTER_SAMPLES_FOLDER_NAME = 'Samples'
const COVER_LETTER_GENERATED_FOLDER_NAME = 'Generated'
const SHEET_NAME = 'Job Tracking'

// Legacy folder names from docs.server.ts
const LEGACY_RESUMES_FOLDER = 'Job App Bot - Resumes'
const LEGACY_COVER_LETTERS_FOLDER = 'Job App Bot - Cover Letters'

export type WorkspaceConfig = {
  rootFolderId: string
  resumesFolderId: string
  coverLettersFolderId: string
  coverLetterSamplesFolderId?: string
  coverLetterGeneratedFolderId?: string
  sheetId: string
  sheetUrl: string
  syncedAt: string
}

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  webViewLink?: string
}

export type SetupResult = {
  config: WorkspaceConfig
  migrated: { resumes: number; coverLetters: number }
}

// --- Config CRUD ---

export function loadWorkspaceConfig(): WorkspaceConfig | null {
  if (!existsSync(WORKSPACE_CONFIG_PATH)) return null
  try {
    return JSON.parse(readFileSync(WORKSPACE_CONFIG_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function saveWorkspaceConfig(config: WorkspaceConfig): void {
  writeFileSync(WORKSPACE_CONFIG_PATH, JSON.stringify(config, null, 2))
}

export function isWorkspaceConfigured(): boolean {
  return loadWorkspaceConfig() !== null
}

export function getWorkspaceSheetId(): string | null {
  return loadWorkspaceConfig()?.sheetId ?? null
}

export function getWorkspaceSheetUrl(): string | null {
  return loadWorkspaceConfig()?.sheetUrl ?? null
}

export function getWorkspaceFolderIds(): { root: string; resumes: string; coverLetters: string; coverLetterSamples?: string; coverLetterGenerated?: string } | null {
  const config = loadWorkspaceConfig()
  if (!config) return null
  return {
    root: config.rootFolderId,
    resumes: config.resumesFolderId,
    coverLetters: config.coverLettersFolderId,
    coverLetterSamples: config.coverLetterSamplesFolderId,
    coverLetterGenerated: config.coverLetterGeneratedFolderId,
  }
}

export function clearWorkspaceConfig(): void {
  if (existsSync(WORKSPACE_CONFIG_PATH)) {
    unlinkSync(WORKSPACE_CONFIG_PATH)
  }
}

// --- Drive helpers ---

function getDrive() {
  const auth = getAuthenticatedClient()
  return google.drive({ version: 'v3', auth })
}

function getSheets() {
  const auth = getAuthenticatedClient()
  return google.sheets({ version: 'v4', auth })
}

async function findFolder(drive: ReturnType<typeof google.drive>, name: string, parentId?: string): Promise<string | null> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : ''
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`,
    fields: 'files(id)',
    spaces: 'drive',
  })
  return res.data.files?.[0]?.id ?? null
}

async function createFolder(drive: ReturnType<typeof google.drive>, name: string, parentId?: string): Promise<string> {
  const requestBody: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) requestBody.parents = [parentId]

  const folder = await drive.files.create({
    requestBody,
    fields: 'id',
  })
  return folder.data.id!
}

async function findSheet(drive: ReturnType<typeof google.drive>, parentId: string): Promise<{ id: string; name: string } | null> {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  })
  return res.data.files?.[0] ? { id: res.data.files[0].id!, name: res.data.files[0].name! } : null
}

// --- Job Search tab headers (same as sheets.server.ts) ---

const JOB_SEARCH_TAB = 'Job Search'
const JOB_SEARCH_HEADERS = [
  'Date Found', 'Platform', 'Company', 'Role', 'Country', 'State', 'City',
  'Job URL (Employer)', 'Source URL', 'Status', 'Score', 'Searched', 'Drafted',
  'Applied', 'Expired', 'Response', 'Recruiter Email', 'Recruiter Phone',
  'Work Type', 'Sponsorship', 'Skills Matched', 'Skills Missing',
]

async function createJobTrackingSheet(parentFolderId: string): Promise<{ sheetId: string; sheetUrl: string }> {
  const sheets = getSheets()
  const drive = getDrive()

  // Create spreadsheet with Job Search tab and headers
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: SHEET_NAME },
      sheets: [{ properties: { title: JOB_SEARCH_TAB } }],
    },
  })

  const sheetId = spreadsheet.data.spreadsheetId!
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`

  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${JOB_SEARCH_TAB}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [JOB_SEARCH_HEADERS] },
  })

  // Move into workspace folder
  await drive.files.update({
    fileId: sheetId,
    addParents: parentFolderId,
    fields: 'id',
  })

  return { sheetId, sheetUrl }
}

// --- Cover Letter subfolders ---

async function ensureCoverLetterSubfolders(
  drive: ReturnType<typeof google.drive>,
  coverLettersFolderId: string,
): Promise<{ samplesId: string; generatedId: string }> {
  let samplesId = await findFolder(drive, COVER_LETTER_SAMPLES_FOLDER_NAME, coverLettersFolderId)
  if (!samplesId) {
    samplesId = await createFolder(drive, COVER_LETTER_SAMPLES_FOLDER_NAME, coverLettersFolderId)
  }

  let generatedId = await findFolder(drive, COVER_LETTER_GENERATED_FOLDER_NAME, coverLettersFolderId)
  if (!generatedId) {
    generatedId = await createFolder(drive, COVER_LETTER_GENERATED_FOLDER_NAME, coverLettersFolderId)
  }

  // Migrate: move any non-folder files directly in Cover Letters/ into Samples/
  const parentFiles = await drive.files.list({
    q: `'${coverLettersFolderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })
  for (const file of parentFiles.data.files ?? []) {
    await drive.files.update({
      fileId: file.id!,
      addParents: samplesId,
      removeParents: coverLettersFolderId,
      fields: 'id',
    })
  }

  return { samplesId, generatedId }
}

// --- Upload file to Drive ---

export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ id: string; webViewLink?: string }> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  const drive = getDrive()
  const { Readable } = await import('node:stream')

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  })

  return { id: res.data.id!, webViewLink: res.data.webViewLink ?? undefined }
}

// --- Discovery ---

export async function discoverWorkspace(): Promise<WorkspaceConfig | null> {
  if (!isAuthenticated()) return null

  const drive = getDrive()

  // Look for ai-job-bot folder at root
  const rootId = await findFolder(drive, WORKSPACE_FOLDER_NAME)
  if (!rootId) return null

  // Look for subfolders
  const resumesId = await findFolder(drive, RESUMES_FOLDER_NAME, rootId)
  const coverLettersId = await findFolder(drive, COVER_LETTERS_FOLDER_NAME, rootId)

  // Look for a spreadsheet
  const sheet = await findSheet(drive, rootId)

  if (!resumesId || !coverLettersId || !sheet) {
    // Partial workspace found - still return what we found so setup can fill gaps
    return null
  }

  const config: WorkspaceConfig = {
    rootFolderId: rootId,
    resumesFolderId: resumesId,
    coverLettersFolderId: coverLettersId,
    sheetId: sheet.id,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${sheet.id}/edit`,
    syncedAt: new Date().toISOString(),
  }

  // Probe for cover letter subfolders
  const clSamplesId = await findFolder(drive, COVER_LETTER_SAMPLES_FOLDER_NAME, coverLettersId)
  const clGeneratedId = await findFolder(drive, COVER_LETTER_GENERATED_FOLDER_NAME, coverLettersId)
  if (clSamplesId) config.coverLetterSamplesFolderId = clSamplesId
  if (clGeneratedId) config.coverLetterGeneratedFolderId = clGeneratedId

  saveWorkspaceConfig(config)
  return config
}

// --- Creation ---

export async function createWorkspace(): Promise<SetupResult> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  const drive = getDrive()

  // Find or create root folder
  let rootId = await findFolder(drive, WORKSPACE_FOLDER_NAME)
  if (!rootId) {
    rootId = await createFolder(drive, WORKSPACE_FOLDER_NAME)
  }

  // Find or create subfolders
  let resumesId = await findFolder(drive, RESUMES_FOLDER_NAME, rootId)
  if (!resumesId) {
    resumesId = await createFolder(drive, RESUMES_FOLDER_NAME, rootId)
  }

  let coverLettersId = await findFolder(drive, COVER_LETTERS_FOLDER_NAME, rootId)
  if (!coverLettersId) {
    coverLettersId = await createFolder(drive, COVER_LETTERS_FOLDER_NAME, rootId)
  }

  // Find existing sheet or create new one
  let sheetId: string
  let sheetUrl: string
  const existingSheet = await findSheet(drive, rootId)
  if (existingSheet) {
    sheetId = existingSheet.id
    sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
  } else {
    const created = await createJobTrackingSheet(rootId)
    sheetId = created.sheetId
    sheetUrl = created.sheetUrl
  }

  // Ensure cover letter subfolders exist and migrate any loose files into Samples/
  const { samplesId, generatedId } = await ensureCoverLetterSubfolders(drive, coverLettersId)

  const config: WorkspaceConfig = {
    rootFolderId: rootId,
    resumesFolderId: resumesId,
    coverLettersFolderId: coverLettersId,
    coverLetterSamplesFolderId: samplesId,
    coverLetterGeneratedFolderId: generatedId,
    sheetId,
    sheetUrl,
    syncedAt: new Date().toISOString(),
  }

  // Migrate legacy folders
  const migrated = await migrateLegacyFolders(drive, resumesId, coverLettersId)

  saveWorkspaceConfig(config)
  return { config, migrated }
}

// --- Setup (discover first, create if not found) ---

export async function setupOrDiscoverWorkspace(): Promise<SetupResult> {
  const existing = await discoverWorkspace()
  if (existing) {
    // Still attempt migration in case legacy folders exist
    const drive = getDrive()
    const migrated = await migrateLegacyFolders(drive, existing.resumesFolderId, existing.coverLettersFolderId)
    return { config: existing, migrated }
  }
  return createWorkspace()
}

// --- Legacy migration ---

async function migrateLegacyFolders(
  drive: ReturnType<typeof google.drive>,
  newResumesId: string,
  newCoverLettersId: string,
): Promise<{ resumes: number; coverLetters: number }> {
  let resumes = 0
  let coverLetters = 0

  // Migrate legacy resumes folder
  const legacyResumesId = await findFolder(drive, LEGACY_RESUMES_FOLDER)
  if (legacyResumesId) {
    resumes = await moveFilesFromFolder(drive, legacyResumesId, newResumesId)
    // Delete empty legacy folder
    try {
      await drive.files.delete({ fileId: legacyResumesId })
    } catch {
      // Folder might not be empty or user may not have delete permission
    }
  }

  // Migrate legacy cover letters folder
  const legacyCoverLettersId = await findFolder(drive, LEGACY_COVER_LETTERS_FOLDER)
  if (legacyCoverLettersId) {
    coverLetters = await moveFilesFromFolder(drive, legacyCoverLettersId, newCoverLettersId)
    try {
      await drive.files.delete({ fileId: legacyCoverLettersId })
    } catch {
      // Same as above
    }
  }

  return { resumes, coverLetters }
}

async function moveFilesFromFolder(
  drive: ReturnType<typeof google.drive>,
  fromFolderId: string,
  toFolderId: string,
): Promise<number> {
  const res = await drive.files.list({
    q: `'${fromFolderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })

  const files = res.data.files ?? []
  for (const file of files) {
    await drive.files.update({
      fileId: file.id!,
      addParents: toFolderId,
      removeParents: fromFolderId,
      fields: 'id',
    })
  }

  return files.length
}

// --- List files in a subfolder ---

export async function listDriveFiles(folderId: string): Promise<DriveFile[]> {
  if (!isAuthenticated()) return []

  const drive = getDrive()
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
    orderBy: 'modifiedTime desc',
    spaces: 'drive',
  })

  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    modifiedTime: f.modifiedTime!,
    webViewLink: f.webViewLink ?? undefined,
  }))
}

// --- Delete a file from Drive ---

export async function deleteDriveFile(fileId: string): Promise<void> {
  const drive = getDrive()
  await drive.files.delete({ fileId })
}

// --- Copy a file with a specific name ---

export async function copyFileWithName(fileId: string, targetFolderId: string, name: string): Promise<DriveFile> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  const drive = getDrive()
  const copied = await drive.files.copy({
    fileId,
    requestBody: { name, parents: [targetFolderId] },
    fields: 'id, name, mimeType, modifiedTime, webViewLink',
  })

  return {
    id: copied.data.id!,
    name: copied.data.name!,
    mimeType: copied.data.mimeType!,
    modifiedTime: copied.data.modifiedTime!,
    webViewLink: copied.data.webViewLink ?? undefined,
  }
}

// --- Copy a file into a workspace subfolder ---

export async function copyFileToWorkspace(fileId: string, targetFolderId: string): Promise<DriveFile> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  const drive = getDrive()
  const copied = await drive.files.copy({
    fileId,
    requestBody: { parents: [targetFolderId] },
    fields: 'id, name, mimeType, modifiedTime, webViewLink',
  })

  return {
    id: copied.data.id!,
    name: copied.data.name!,
    mimeType: copied.data.mimeType!,
    modifiedTime: copied.data.modifiedTime!,
    webViewLink: copied.data.webViewLink ?? undefined,
  }
}
