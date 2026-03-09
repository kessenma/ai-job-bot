import { createServerFn } from '@tanstack/react-start'
import { db, schema } from '@job-app-bot/db'
import { eq } from 'drizzle-orm'
import { loadJobs } from './jobs.server.ts'
import { saveFile, deleteFile } from './uploads.server.ts'

export const getJobs = createServerFn({ method: 'GET' }).handler(async () => {
  return loadJobs()
})

/** Get all job_url -> upload_name mappings */
export const getJobCoverLetters = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = await db
    .select({
      jobUrl: schema.jobCoverLetters.jobUrl,
      uploadName: schema.jobCoverLetters.uploadName,
      createdAt: schema.jobCoverLetters.createdAt,
    })
    .from(schema.jobCoverLetters)

  // Join with uploads to get original file name
  const uploads = await db
    .select({ name: schema.uploads.name, originalName: schema.uploads.originalName })
    .from(schema.uploads)

  const uploadMap = new Map(uploads.map((u) => [u.name, u.originalName]))

  return Object.fromEntries(
    rows.map((r) => [
      r.jobUrl,
      {
        uploadName: r.uploadName,
        originalName: uploadMap.get(r.uploadName) ?? r.uploadName,
        createdAt: r.createdAt,
      },
    ]),
  ) as Record<string, { uploadName: string; originalName: string; createdAt: string }>
})

/** Attach an existing cover letter (from settings uploads) to a job */
export const attachCoverLetterToJob = createServerFn({ method: 'POST' })
  .inputValidator((data: { jobUrl: string; uploadName: string }) => data)
  .handler(async ({ data }) => {
    await db
      .insert(schema.jobCoverLetters)
      .values({ jobUrl: data.jobUrl, uploadName: data.uploadName })
      .onConflictDoUpdate({
        target: schema.jobCoverLetters.jobUrl,
        set: { uploadName: data.uploadName, createdAt: new Date().toISOString() },
      })
    return true
  })

/** Upload a new cover letter and attach it to a job */
export const uploadCoverLetterForJob = createServerFn({ method: 'POST' })
  .inputValidator((data: { jobUrl: string; fileName: string; base64Data: string }) => data)
  .handler(async ({ data }) => {
    const file = await saveFile('cover-letter', data.fileName, data.base64Data)
    await db
      .insert(schema.jobCoverLetters)
      .values({ jobUrl: data.jobUrl, uploadName: file.name })
      .onConflictDoUpdate({
        target: schema.jobCoverLetters.jobUrl,
        set: { uploadName: file.name, createdAt: new Date().toISOString() },
      })
    return { uploadName: file.name, originalName: file.originalName }
  })

/** Remove the cover letter link from a job */
export const removeCoverLetterFromJob = createServerFn({ method: 'POST' })
  .inputValidator((data: { jobUrl: string }) => data)
  .handler(async ({ data }) => {
    await db
      .delete(schema.jobCoverLetters)
      .where(eq(schema.jobCoverLetters.jobUrl, data.jobUrl))
    return true
  })
