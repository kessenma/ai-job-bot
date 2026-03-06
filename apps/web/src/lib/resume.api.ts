import { createServerFn } from '@tanstack/react-start'
import { deleteFile, listFiles, saveFile } from './uploads.server.ts'

export const getResume = createServerFn({ method: 'GET' }).handler(() => {
  const files = listFiles('resume')
  return files[0] ?? null
})

export const uploadResume = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string; base64Data: string }) => data)
  .handler(({ data }) => {
    return saveFile('resume', data.fileName, data.base64Data, { replaceAll: true })
  })

export const removeResume = createServerFn({ method: 'POST' }).handler(() => {
  const files = listFiles('resume')
  for (const f of files) {
    deleteFile('resume', f.name)
  }
  return true
})

export const getCoverLetters = createServerFn({ method: 'GET' }).handler(() => {
  return listFiles('cover-letter')
})

export const uploadCoverLetter = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string; base64Data: string }) => data)
  .handler(({ data }) => {
    return saveFile('cover-letter', data.fileName, data.base64Data)
  })

export const removeCoverLetter = createServerFn({ method: 'POST' })
  .inputValidator((data: { fileName: string }) => data)
  .handler(({ data }) => {
    return deleteFile('cover-letter', data.fileName)
  })
