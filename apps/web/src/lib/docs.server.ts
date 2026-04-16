import { google } from 'googleapis'
import { getAuthenticatedClient, isAuthenticated } from './gmail.server.ts'
import { getWorkspaceFolderIds } from './drive-workspace.server.ts'

export function extractDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}

export async function importGoogleDoc(docUrl: string): Promise<{
  pdfBase64: string
  plainText: string
  title: string
}> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  const docId = extractDocId(docUrl)
  if (!docId) {
    throw new Error('Invalid Google Docs URL. Expected: docs.google.com/document/d/...')
  }

  const auth = getAuthenticatedClient()
  const drive = google.drive({ version: 'v3', auth })

  // Get document title
  const fileMeta = await drive.files.get({ fileId: docId, fields: 'name' }).catch(() => {
    throw new Error('Cannot access this document. Make sure it\'s in your Google Drive or shared with you.')
  })
  const title = fileMeta.data.name ?? 'resume'

  // Export as plain text
  const textRes = await drive.files.export({ fileId: docId, mimeType: 'text/plain' })
  const plainText = (typeof textRes.data === 'string' ? textRes.data : String(textRes.data)).trim()

  // Export as PDF
  const pdfRes = await drive.files.export(
    { fileId: docId, mimeType: 'application/pdf' },
    { responseType: 'arraybuffer' },
  )
  const pdfBase64 = Buffer.from(pdfRes.data as ArrayBuffer).toString('base64')

  return { pdfBase64, plainText, title }
}

const RESUME_FOLDER_NAME = 'Job App Bot - Resumes'

async function findOrCreateFolder(drive: ReturnType<typeof google.drive>, folderName: string): Promise<string> {
  // Search for existing folder
  const res = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!
  }

  // Create the folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })

  return folder.data.id!
}

export async function createResumeDoc(
  title: string,
  content: string,
): Promise<{ docId: string; docUrl: string }> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  const auth = getAuthenticatedClient()
  const docs = google.docs({ version: 'v1', auth })
  const drive = google.drive({ version: 'v3', auth })

  // Create a new Google Doc
  const doc = await docs.documents.create({
    requestBody: { title },
  })

  const docId = doc.data.documentId!
  const docUrl = `https://docs.google.com/document/d/${docId}`

  // Insert content with basic formatting
  // Split content into sections and apply heading styles
  const lines = content.split('\n')
  const requests: Array<Record<string, unknown>> = []
  let index = 1 // Docs API uses 1-based index

  for (const line of lines) {
    const text = line + '\n'
    requests.push({
      insertText: { location: { index }, text },
    })

    // Apply heading style for lines that look like section headers (all caps or start with ##)
    const isHeading = /^#{1,2}\s/.test(line) || (/^[A-Z][A-Z\s&]+$/.test(line.trim()) && line.trim().length > 2)
    if (isHeading) {
      const cleanText = line.replace(/^#{1,2}\s*/, '')
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: index, endIndex: index + text.length },
          paragraphStyle: { namedStyleType: 'HEADING_2' },
          fields: 'namedStyleType',
        },
      })
      // Bold the heading text
      requests.push({
        updateTextStyle: {
          range: { startIndex: index, endIndex: index + cleanText.length },
          textStyle: { bold: true },
          fields: 'bold',
        },
      })
    }

    index += text.length
  }

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    })
  }

  // Move to the resumes folder (prefer workspace subfolder)
  const workspace = getWorkspaceFolderIds()
  const folderId = workspace?.resumes ?? await findOrCreateFolder(drive, RESUME_FOLDER_NAME)
  await drive.files.update({
    fileId: docId,
    addParents: folderId,
    fields: 'id',
  })

  return { docId, docUrl }
}

const COVER_LETTER_FOLDER_NAME = 'Job App Bot - Cover Letters'

export async function createCoverLetterDoc(
  title: string,
  content: string,
): Promise<{ docId: string; docUrl: string }> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  const auth = getAuthenticatedClient()
  const docs = google.docs({ version: 'v1', auth })
  const drive = google.drive({ version: 'v3', auth })

  const doc = await docs.documents.create({
    requestBody: { title },
  })

  const docId = doc.data.documentId!
  const docUrl = `https://docs.google.com/document/d/${docId}`

  // Insert content with basic formatting
  const lines = content.split('\n')
  const requests: Array<Record<string, unknown>> = []
  let index = 1

  for (const line of lines) {
    const text = line + '\n'
    requests.push({
      insertText: { location: { index }, text },
    })

    // Bold salutation lines (Dear..., Hi...)
    const isSalutation = /^(Dear|Hi|Hello|To Whom)/i.test(line.trim())
    if (isSalutation) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: index, endIndex: index + text.length },
          textStyle: { bold: true },
          fields: 'bold',
        },
      })
    }

    index += text.length
  }

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    })
  }

  // Move to the Generated subfolder (prefer workspace subfolder)
  const workspace = getWorkspaceFolderIds()
  const folderId = workspace?.coverLetterGenerated ?? workspace?.coverLetters ?? await findOrCreateFolder(drive, COVER_LETTER_FOLDER_NAME)
  await drive.files.update({
    fileId: docId,
    addParents: folderId,
    fields: 'id',
  })

  return { docId, docUrl }
}

export async function createSampleDoc(
  title: string,
  content: string,
): Promise<{ docId: string; docUrl: string }> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  const auth = getAuthenticatedClient()
  const docs = google.docs({ version: 'v1', auth })
  const drive = google.drive({ version: 'v3', auth })

  const doc = await docs.documents.create({
    requestBody: { title },
  })

  const docId = doc.data.documentId!
  const docUrl = `https://docs.google.com/document/d/${docId}`

  // Insert content
  if (content.trim()) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text: content } }],
      },
    })
  }

  // Move to the Samples subfolder
  const workspace = getWorkspaceFolderIds()
  const folderId = workspace?.coverLetterSamples ?? workspace?.coverLetters ?? await findOrCreateFolder(drive, COVER_LETTER_FOLDER_NAME)
  await drive.files.update({
    fileId: docId,
    addParents: folderId,
    fields: 'id',
  })

  return { docId, docUrl }
}

export async function exportDocAsPdf(docId: string): Promise<string> {
  if (!isAuthenticated()) {
    throw new Error('Google account not connected. Please connect in Settings.')
  }

  const auth = getAuthenticatedClient()
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.export(
    { fileId: docId, mimeType: 'application/pdf' },
    { responseType: 'arraybuffer' },
  )

  return Buffer.from(res.data as ArrayBuffer).toString('base64')
}
