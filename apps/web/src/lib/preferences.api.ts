import { createServerFn } from '@tanstack/react-start'
import { db, schema } from '@job-app-bot/db'
import { eq } from 'drizzle-orm'
import type { JobPreferences } from './job-filters.ts'

export const getJobPreferences = createServerFn({ method: 'GET' }).handler(async (): Promise<JobPreferences | null> => {
  const rows = await db.select().from(schema.jobPreferences).limit(1)
  if (!rows[0]) return null
  const row = rows[0]
  return {
    companyBlacklist: row.companyBlacklist ? JSON.parse(row.companyBlacklist) : [],
    titleBlacklist: row.titleBlacklist ? JSON.parse(row.titleBlacklist) : [],
    workType: (row.workType as JobPreferences['workType']) || 'any',
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCurrency: row.salaryCurrency || 'EUR',
    minSuitabilityScore: row.minSuitabilityScore || 5,
  }
})

export const saveJobPreferences = createServerFn({ method: 'POST' })
  .inputValidator((data: JobPreferences) => data)
  .handler(async ({ data }) => {
    const existing = await db.select().from(schema.jobPreferences).limit(1)
    const values = {
      companyBlacklist: JSON.stringify(data.companyBlacklist),
      titleBlacklist: JSON.stringify(data.titleBlacklist),
      workType: data.workType,
      salaryMin: data.salaryMin,
      salaryMax: data.salaryMax,
      salaryCurrency: data.salaryCurrency,
      minSuitabilityScore: data.minSuitabilityScore,
      updatedAt: new Date().toISOString(),
    }
    if (existing.length > 0) {
      await db.update(schema.jobPreferences).set(values).where(eq(schema.jobPreferences.id, existing[0].id))
    } else {
      await db.insert(schema.jobPreferences).values(values)
    }
    return data
  })
