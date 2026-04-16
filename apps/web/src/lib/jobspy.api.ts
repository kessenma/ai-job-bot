import { createServerFn } from '@tanstack/react-start'
import { classifyATS } from '@job-app-bot/shared/ats-classifier'
import { db, schema } from '@job-app-bot/db'
import { eq, or } from 'drizzle-orm'
import { parseLocation } from './location-parser.ts'
import type { JobSpyResult } from '#/lib/types.ts'

const JOBSPY_URL = process.env.JOBSPY_SERVICE_URL || 'http://localhost:8085'

export const searchMultiBoard = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    sites: string[]
    searchTerm: string
    location?: string
    distance?: number
    isRemote?: boolean
    jobType?: string
    resultsWanted?: number
    hoursOld?: number
    country?: string
  }) => data)
  .handler(async ({ data }) => {
    const res = await fetch(`${JOBSPY_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sites: data.sites,
        search_term: data.searchTerm,
        location: data.location || undefined,
        distance: data.distance ?? 50,
        is_remote: data.isRemote ?? false,
        job_type: data.jobType || undefined,
        results_wanted: data.resultsWanted ?? 15,
        hours_old: data.hoursOld || undefined,
        country: data.country || 'usa',
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      throw new Error(`JobSpy service error: ${res.status} ${res.statusText}`)
    }

    const body = await res.json() as { status: string; results: JobSpyResult[]; total: number; message?: string }

    if (body.status === 'error') {
      throw new Error(body.message || 'Search failed')
    }

    return body
  })

export const addJobBoardResultToTracker = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    title: string
    company: string
    jobUrl: string
    location: string
    site: string
  }) => data)
  .handler(async ({ data }) => {
    const { ensureJobSearchTab, appendToJobSearchTab } = await import('./sheets.server.ts')
    const now = new Date().toISOString()
    const today = now.split('T')[0]
    const jobUrl = data.jobUrl

    // Check for duplicates
    const existing = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(or(eq(schema.jobs.jobUrl, jobUrl), eq(schema.jobs.sourceUrl, jobUrl)))
      .limit(1)

    if (existing.length > 0) {
      return { ...existing[0], duplicate: true }
    }

    const loc = parseLocation(data.location)

    const [inserted] = await db.insert(schema.jobs).values({
      company: data.company,
      role: data.title,
      jobUrl,
      sourceUrl: jobUrl,
      location: data.location,
      country: loc.country || null,
      state: loc.state || null,
      city: loc.city || null,
      date: today,
      source: data.site,
      atsPlatform: classifyATS(jobUrl),
      activityStatus: 'New',
      applicationStatus: 'Not Applied',
      searchedAt: now,
    }).returning()

    // Write to Google Sheet
    try {
      await ensureJobSearchTab()
      await appendToJobSearchTab([{
        company: data.company,
        role: data.title,
        platform: data.site,
        jobUrl,
        sourceUrl: jobUrl,
        country: loc.country,
        state: loc.state,
        city: loc.city,
        workType: '',
        sponsorship: '',
        recruiterEmail: '',
        recruiterPhone: '',
        status: 'new',
        searchedAt: now,
        date: today,
      }])
    } catch (err) {
      console.error('Failed to write to Google Sheet (job was still saved locally):', err)
    }

    return inserted
  })
