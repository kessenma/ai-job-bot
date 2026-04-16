import { createServerFn } from '@tanstack/react-start'
import { classifyATS } from '@job-app-bot/shared/ats-classifier'
import { db, schema } from '@job-app-bot/db'
import { eq, desc, inArray } from 'drizzle-orm'
import { fillForm, linkedInEasyApply, type FillFormResult, type EasyApplyResult } from './playwright.api.ts'

const PLAYWRIGHT_URL = process.env.PLAYWRIGHT_SERVICE_URL || 'http://localhost:8084'

export type QueueItem = typeof schema.applicationQueue.$inferSelect
export type QueueItemWithScreenshot = QueueItem & { screenshotImage?: string }

// --- Queue a dry-run for a single job ---

export const queueDryRun = createServerFn({ method: 'POST' })
  .inputValidator((data: { jobUrl: string; company: string; role?: string; jobId?: number; sessionId?: string }) => data)
  .handler(async ({ data }): Promise<QueueItem> => {
    // Try to look up job in DB for metadata (may not exist if sourced from sheets only)
    let jobId = data.jobId || null
    let company = data.company
    let role = data.role || null
    let suitabilityScore: number | null = null

    if (jobId) {
      const [job] = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId))
        .limit(1)
      if (job) {
        company = job.company
        role = job.role || role
        suitabilityScore = job.suitabilityScore || null
      }
    } else {
      // Try to find by URL
      const [job] = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.jobUrl, data.jobUrl))
        .limit(1)
      if (job) {
        jobId = job.id
        company = job.company
        role = job.role || role
        suitabilityScore = job.suitabilityScore || null
      }
    }

    const isLinkedIn = data.jobUrl.includes('linkedin.com/jobs')
    const handler = isLinkedIn ? 'linkedin-easy-apply' : 'fill-form'
    const atsPlatform = classifyATS(data.jobUrl)

    let filledFields: { label: string; value: string; type: string }[]
    let skippedFields: { label: string; type: string; required: boolean; options?: string[]; selector?: string }[] | null = null
    let unansweredQuestions: { label: string; type: string; options?: string[]; required: boolean }[] | null = null
    let stepsCompleted: number | null = null
    let screenshotBase64: string | undefined
    let screenshotTitle: string | undefined
    let dryRunTimeMs: number | undefined

    if (isLinkedIn) {
      const result: EasyApplyResult = await linkedInEasyApply({
        data: { jobUrl: data.jobUrl, jobId: jobId || undefined, dryRun: true },
      })
      filledFields = (result.answeredQuestions || []).map((q) => ({
        label: q.label,
        value: q.value,
        type: q.type,
      }))
      unansweredQuestions = result.unansweredQuestions || null
      stepsCompleted = result.stepsCompleted
      screenshotBase64 = result.screenshot
      screenshotTitle = `Dry Run: ${company} - ${result.status}`
    } else {
      const result: FillFormResult = await fillForm({ data: { url: data.jobUrl, sessionId: data.sessionId } })
      filledFields = result.filled.map((f) => ({
        label: f.label,
        value: f.value,
        type: f.type,
      }))
      skippedFields = result.skipped
      screenshotBase64 = result.screenshot
      screenshotTitle = `Dry Run: ${company}`
      dryRunTimeMs = result.timeMs
    }

    // Save screenshot
    let screenshotId: number | null = null
    if (screenshotBase64) {
      const [saved] = await db
        .insert(schema.screenshots)
        .values({
          jobId: jobId || null,
          url: data.jobUrl,
          image: screenshotBase64,
          title: screenshotTitle || null,
          status: 'loaded',
          hasCaptcha: false,
          atsPlatform,
        })
        .returning()
      screenshotId = saved.id
    }

    // Insert queue item
    const [queued] = await db
      .insert(schema.applicationQueue)
      .values({
        jobId: jobId || null,
        jobUrl: data.jobUrl,
        company,
        role,
        handler,
        atsPlatform,
        filledFields: JSON.stringify(filledFields),
        skippedFields: skippedFields ? JSON.stringify(skippedFields) : null,
        unansweredQuestions: unansweredQuestions ? JSON.stringify(unansweredQuestions) : null,
        stepsCompleted,
        screenshotId,
        suitabilityScore,
        dryRunTimeMs: dryRunTimeMs || null,
      })
      .returning()

    // Set draftedAt on the job record
    if (jobId) {
      await db
        .update(schema.jobs)
        .set({ draftedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(schema.jobs.id, jobId))
    }

    return queued
  })

// --- Get queue items ---

export const getApplicationQueue = createServerFn({ method: 'GET' }).handler(
  async (): Promise<QueueItemWithScreenshot[]> => {
    const items = await db
      .select()
      .from(schema.applicationQueue)
      .orderBy(desc(schema.applicationQueue.suitabilityScore))

    // Join screenshots
    const results: QueueItemWithScreenshot[] = []
    for (const item of items) {
      let screenshotImage: string | undefined
      if (item.screenshotId) {
        const [ss] = await db
          .select({ image: schema.screenshots.image })
          .from(schema.screenshots)
          .where(eq(schema.screenshots.id, item.screenshotId))
          .limit(1)
        screenshotImage = ss?.image
      }
      results.push({ ...item, screenshotImage })
    }

    return results
  },
)

// --- Mark item as approved or rejected ---

export const markReviewed = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      action: 'approved' | 'rejected'
      edits?: { label: string; originalValue: string; newValue: string }[]
    }) => data,
  )
  .handler(async ({ data }) => {
    await db
      .update(schema.applicationQueue)
      .set({
        status: data.action,
        userEdits: data.edits ? JSON.stringify(data.edits) : null,
        reviewedAt: new Date().toISOString(),
      })
      .where(eq(schema.applicationQueue.id, data.id))
    return { success: true }
  })

// --- Submit approved items ---

export const submitApproved = createServerFn({ method: 'POST' })
  .inputValidator((data: { ids: number[] }) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      submitted: number
      failed: number
      expired: number
      errors: string[]
    }> => {
      const items = await db
        .select()
        .from(schema.applicationQueue)
        .where(inArray(schema.applicationQueue.id, data.ids))

      let submitted = 0
      let failed = 0
      let expired = 0
      const errors: string[] = []

      for (const item of items) {
        if (item.status !== 'approved') continue

        // Probe the URL first to check if listing is still live
        try {
          const probeRes = await fetch(`${PLAYWRIGHT_URL}/probe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [item.jobUrl] }),
            signal: AbortSignal.timeout(20000),
          })
          if (probeRes.ok) {
            const probeJson = (await probeRes.json()) as {
              results: { status: string }[]
            }
            const probeStatus = probeJson.results?.[0]?.status
            if (probeStatus === 'expired' || probeStatus === 'blocked') {
              await db
                .update(schema.applicationQueue)
                .set({
                  status: 'expired',
                  failureReason: 'Job listing no longer available',
                  submittedAt: new Date().toISOString(),
                })
                .where(eq(schema.applicationQueue.id, item.id))
              if (item.jobId) {
                await db
                  .update(schema.jobs)
                  .set({
                    applicationStatus: 'Expired',
                    expiredAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  })
                  .where(eq(schema.jobs.id, item.jobId))
              }
              expired++
              continue
            }
          }
        } catch {
          // Probe failed — proceed with submission attempt anyway
        }

        // Submit the application
        try {
          if (item.handler === 'linkedin-easy-apply') {
            const result = await linkedInEasyApply({
              data: {
                jobUrl: item.jobUrl,
                jobId: item.jobId || undefined,
                dryRun: false,
              },
            })
            if (result.status === 'applied') {
              await db
                .update(schema.applicationQueue)
                .set({
                  status: 'submitted',
                  submittedAt: new Date().toISOString(),
                })
                .where(eq(schema.applicationQueue.id, item.id))
              if (item.jobId) {
                await db
                  .update(schema.jobs)
                  .set({
                    applicationStatus: 'Applied',
                    appliedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  })
                  .where(eq(schema.jobs.id, item.jobId))
              }
              submitted++
            } else {
              throw new Error(
                result.error || result.message || `Status: ${result.status}`,
              )
            }
          } else {
            // For non-LinkedIn, use the /apply endpoint
            const profiles = await db
              .select()
              .from(schema.applyProfile)
              .limit(1)
            if (!profiles[0]) throw new Error('No apply profile configured')
            const profile = profiles[0]

            const res = await fetch(`${PLAYWRIGHT_URL}/apply`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: item.jobUrl,
                profile: {
                  fullName: [profile.firstName, profile.lastName]
                    .filter(Boolean)
                    .join(' '),
                  email: profile.email,
                  phone:
                    [profile.phoneCountryCode, profile.phone]
                      .filter(Boolean)
                      .join(' ') || '',
                  linkedinUrl: profile.linkedinUrl || '',
                  resumePath: '',
                  firstName: profile.firstName,
                  lastName: profile.lastName,
                  city: profile.city,
                  state: profile.state,
                  zipCode: profile.zipCode,
                  country: profile.country,
                },
              }),
              signal: AbortSignal.timeout(120000),
            })

            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(
                (body as { error?: string }).error || `HTTP ${res.status}`,
              )
            }

            const json = (await res.json()) as {
              handler: string
              result: { status: string; reason?: string }
            }
            if (json.result.status === 'applied') {
              await db
                .update(schema.applicationQueue)
                .set({
                  status: 'submitted',
                  submittedAt: new Date().toISOString(),
                })
                .where(eq(schema.applicationQueue.id, item.id))
              if (item.jobId) {
                await db
                  .update(schema.jobs)
                  .set({
                    applicationStatus: 'Applied',
                    appliedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  })
                  .where(eq(schema.jobs.id, item.jobId))
              }
              submitted++
            } else {
              throw new Error(
                json.result.reason || `Status: ${json.result.status}`,
              )
            }
          }
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Unknown error'
          await db
            .update(schema.applicationQueue)
            .set({
              status: 'failed',
              failureReason: errorMessage,
              submittedAt: new Date().toISOString(),
            })
            .where(eq(schema.applicationQueue.id, item.id))

          // Log the error
          try {
            const { logApplyError } = await import('./error-log.api.ts')
            await logApplyError({
              data: {
                jobId: item.jobId || undefined,
                jobUrl: item.jobUrl,
                handler: item.handler,
                errorType: 'unknown',
                errorMessage,
                screenshotId: item.screenshotId || undefined,
              },
            })
          } catch {
            /* error log failed */
          }

          failed++
          errors.push(`${item.company}: ${errorMessage}`)
        }
      }

      return { submitted, failed, expired, errors }
    },
  )

// --- Bulk queue dry-runs ---

export const bulkQueueDryRun = createServerFn({ method: 'POST' })
  .inputValidator((data: { jobs: { jobUrl: string; company: string; role?: string }[] }) => data)
  .handler(
    async ({
      data,
    }): Promise<{ queued: number; failed: number; errors: string[] }> => {
      let queued = 0
      let failedCount = 0
      const errors: string[] = []

      for (const job of data.jobs) {
        // Skip if already in queue
        const existing = await db
          .select({ id: schema.applicationQueue.id })
          .from(schema.applicationQueue)
          .where(eq(schema.applicationQueue.jobUrl, job.jobUrl))
          .limit(1)
        if (existing.length > 0) continue

        try {
          await queueDryRun({ data: { jobUrl: job.jobUrl, company: job.company, role: job.role } })
          queued++
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          errors.push(`${job.company}: ${msg}`)
          failedCount++
        }
      }

      return { queued, failed: failedCount, errors }
    },
  )
