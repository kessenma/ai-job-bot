import { createServerFn } from '@tanstack/react-start'
import {
  loadWorkspaceConfig,
  isWorkspaceConfigured,
  setupOrDiscoverWorkspace,
  discoverWorkspace,
  clearWorkspaceConfig,
  listDriveFiles,
  copyFileToWorkspace,
  copyFileWithName,
  deleteDriveFile,
  type WorkspaceConfig,
  type DriveFile,
  type SetupResult,
} from './drive-workspace.server.ts'
import { isAuthenticated } from './gmail.server.ts'

export type { WorkspaceConfig, DriveFile, SetupResult }

export type WorkspaceStatus = {
  configured: boolean
  authenticated: boolean
  config: WorkspaceConfig | null
}

export const getDriveWorkspaceStatus = createServerFn({ method: 'GET' }).handler((): WorkspaceStatus => {
  return {
    configured: isWorkspaceConfigured(),
    authenticated: isAuthenticated(),
    config: loadWorkspaceConfig(),
  }
})

export const setupDriveWorkspace = createServerFn({ method: 'POST' }).handler(async (): Promise<SetupResult> => {
  return setupOrDiscoverWorkspace()
})

export const syncDriveWorkspace = createServerFn({ method: 'POST' }).handler(async (): Promise<WorkspaceStatus> => {
  await discoverWorkspace()
  return {
    configured: isWorkspaceConfigured(),
    authenticated: isAuthenticated(),
    config: loadWorkspaceConfig(),
  }
})

export const disconnectDriveWorkspace = createServerFn({ method: 'POST' }).handler(() => {
  clearWorkspaceConfig()
  return { success: true }
})

export const listDriveResumes = createServerFn({ method: 'GET' }).handler(async (): Promise<DriveFile[]> => {
  const config = loadWorkspaceConfig()
  if (!config) return []
  return listDriveFiles(config.resumesFolderId)
})

export const listDriveCoverLetters = createServerFn({ method: 'GET' }).handler(async (): Promise<DriveFile[]> => {
  const config = loadWorkspaceConfig()
  if (!config) return []
  return listDriveFiles(config.coverLettersFolderId)
})

export const copyFileToDriveResumes = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileId: string }) => data)
  .handler(async ({ data }): Promise<DriveFile> => {
    const config = loadWorkspaceConfig()
    if (!config) throw new Error('Drive workspace not configured')
    return copyFileToWorkspace(data.fileId, config.resumesFolderId)
  })

export const copyFileToDriveCoverLetters = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileId: string }) => data)
  .handler(async ({ data }): Promise<DriveFile> => {
    const config = loadWorkspaceConfig()
    if (!config) throw new Error('Drive workspace not configured')
    return copyFileToWorkspace(data.fileId, config.coverLettersFolderId)
  })

const PRIMARY_PREFIX = 'PRIMARY-'

export const setDrivePrimaryResume = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileId: string; fileName: string }) => data)
  .handler(async ({ data }): Promise<DriveFile> => {
    const config = loadWorkspaceConfig()
    if (!config) throw new Error('Drive workspace not configured')

    // Find and delete any existing PRIMARY- files in the Resumes folder
    const existing = await listDriveFiles(config.resumesFolderId)
    for (const f of existing) {
      if (f.name.startsWith(PRIMARY_PREFIX)) {
        try { await deleteDriveFile(f.id) } catch { /* may already be gone */ }
      }
    }

    // Copy the selected file with PRIMARY- prefix
    const primaryName = `${PRIMARY_PREFIX}${data.fileName}`
    return copyFileWithName(data.fileId, config.resumesFolderId, primaryName)
  })

export const clearDrivePrimaryResume = createServerFn({ method: 'POST' })
  .handler(async () => {
    const config = loadWorkspaceConfig()
    if (!config) throw new Error('Drive workspace not configured')

    const existing = await listDriveFiles(config.resumesFolderId)
    for (const f of existing) {
      if (f.name.startsWith(PRIMARY_PREFIX)) {
        try { await deleteDriveFile(f.id) } catch { /* may already be gone */ }
      }
    }
    return { success: true }
  })
