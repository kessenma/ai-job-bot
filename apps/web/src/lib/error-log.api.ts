import { createServerFn } from '@tanstack/react-start'
import { db, schema } from '@job-app-bot/db'
import { eq, desc, and } from 'drizzle-orm'

export type ApplyError = typeof schema.applyErrors.$inferSelect
export type ApplyErrorWithScreenshot = ApplyError & { screenshotImage?: string }

export const getApplyErrors = createServerFn({ method: 'POST' })
  .inputValidator((data: { handler?: string; errorType?: string; dismissed?: boolean }) => data)
  .handler(async ({ data }): Promise<ApplyErrorWithScreenshot[]> => {
    const conditions = []
    if (data.dismissed !== undefined) {
      conditions.push(eq(schema.applyErrors.dismissed, data.dismissed))
    }
    if (data.handler) {
      conditions.push(eq(schema.applyErrors.handler, data.handler))
    }
    if (data.errorType) {
      conditions.push(eq(schema.applyErrors.errorType, data.errorType))
    }

    const errors = await db
      .select()
      .from(schema.applyErrors)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.applyErrors.createdAt))
      .limit(100)

    // Join with screenshots for those that have one
    const results: ApplyErrorWithScreenshot[] = []
    for (const error of errors) {
      let screenshotImage: string | undefined
      if (error.screenshotId) {
        const [ss] = await db
          .select({ image: schema.screenshots.image })
          .from(schema.screenshots)
          .where(eq(schema.screenshots.id, error.screenshotId))
          .limit(1)
        screenshotImage = ss?.image
      }
      results.push({ ...error, screenshotImage })
    }

    return results
  })

export const logApplyError = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    jobId?: number
    jobUrl?: string
    handler: string
    errorType: string
    errorMessage: string
    screenshotId?: number
    stepsCompleted?: number
  }) => data)
  .handler(async ({ data }) => {
    const [inserted] = await db
      .insert(schema.applyErrors)
      .values({
        jobId: data.jobId || null,
        jobUrl: data.jobUrl || null,
        handler: data.handler,
        errorType: data.errorType,
        errorMessage: data.errorMessage,
        screenshotId: data.screenshotId || null,
        stepsCompleted: data.stepsCompleted || null,
      })
      .returning()
    return inserted
  })

export const dismissError = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    await db
      .update(schema.applyErrors)
      .set({ dismissed: true })
      .where(eq(schema.applyErrors.id, data.id))
    return { success: true }
  })

export const dismissAllErrors = createServerFn({ method: 'POST' })
  .handler(async () => {
    await db
      .update(schema.applyErrors)
      .set({ dismissed: true })
      .where(eq(schema.applyErrors.dismissed, false))
    return { success: true }
  })

export const clearDismissedErrors = createServerFn({ method: 'POST' })
  .handler(async () => {
    await db
      .delete(schema.applyErrors)
      .where(eq(schema.applyErrors.dismissed, true))
    return { success: true }
  })
