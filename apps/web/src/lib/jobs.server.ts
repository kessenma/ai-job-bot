import { db, schema } from '@job-app-bot/db'
import { desc } from 'drizzle-orm'
import { ensureDb } from '@job-app-bot/db/init'
import type { JobLead, ATSPlatform } from './types.ts'

export async function loadJobs(): Promise<JobLead[]> {
  await ensureDb()
  const rows = await db.select().from(schema.jobs).orderBy(desc(schema.jobs.createdAt))
  return rows.map((row) => ({
    id: row.id,
    date: row.date ?? '',
    company: row.company,
    role: row.role ?? '',
    location: row.location ?? '',
    country: row.country,
    state: row.state,
    city: row.city,
    recruiterLinkedin: row.recruiterLinkedin ?? '',
    recruiterEmail: row.recruiterEmail ?? '',
    recruiterPhone: row.recruiterPhone ?? '',
    jobUrl: row.jobUrl ?? '',
    sourceUrl: row.sourceUrl,
    activityStatus: row.activityStatus ?? '',
    alignmentStatus: row.alignmentStatus ?? '',
    candidateRemarks: row.candidateRemarks ?? '',
    applicationStatus: row.applicationStatus ?? '',
    followUpEmailStatus: row.followUpEmailStatus ?? '',
    accountManagerRemarks: row.accountManagerRemarks ?? '',
    atsPlatform: (row.atsPlatform as ATSPlatform) ?? 'unknown',
    suitabilityScore: row.suitabilityScore,
    suitabilityReason: row.suitabilityReason,
    source: row.source,
    searchedAt: row.searchedAt,
    draftedAt: row.draftedAt,
    appliedAt: row.appliedAt,
    expiredAt: row.expiredAt,
    respondedAt: row.respondedAt,
  }))
}

export type { JobLead }
