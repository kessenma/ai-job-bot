import { createServerFn } from '@tanstack/react-start'
import { classifyATS } from '@job-app-bot/shared/ats-classifier'
import type { ProbeResult } from '@job-app-bot/shared'
import { db, schema } from '@job-app-bot/db'
import { eq, desc } from 'drizzle-orm'

const PLAYWRIGHT_URL = process.env.PLAYWRIGHT_SERVICE_URL || 'http://localhost:8084'

export const getPlaywrightStatus = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const res = await fetch(`${PLAYWRIGHT_URL}/health`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { connected: false, status: 'error' as const }
    return { connected: true, ...(await res.json()) }
  } catch {
    return { connected: false, status: 'unreachable' as const }
  }
})

export const probeUrls = createServerFn({ method: 'POST' })
  .inputValidator((data: { urls: string[] }) => data)
  .handler(async ({ data }): Promise<{ results: ProbeResult[]; totalTimeMs: number }> => {
    const res = await fetch(`${PLAYWRIGHT_URL}/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: data.urls }),
      signal: AbortSignal.timeout(data.urls.length * 20000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
    }
    const raw = (await res.json()) as {
      results: Omit<ProbeResult, 'atsPlatform'>[]
      totalTimeMs: number
    }
    const results: ProbeResult[] = raw.results.map((r) => ({
      ...r,
      atsPlatform: classifyATS(r.url),
    }))
    return { results, totalTimeMs: raw.totalTimeMs }
  })

export type Screenshot = typeof schema.screenshots.$inferSelect

export const screenshotUrl = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string }) => data)
  .handler(async ({ data }): Promise<Screenshot> => {
    const res = await fetch(`${PLAYWRIGHT_URL}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: data.url }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
    }
    const result = (await res.json()) as {
      screenshot: string
      title: string | null
      status: string
      hasCaptcha: boolean
      httpStatus: number | null
      actions?: {
        dismissedCookies: boolean
        clickedApply: boolean
        applyButtonText: string | null
        navigatedTo: string | null
      }
    }

    const atsPlatform = classifyATS(data.url)

    const [saved] = await db
      .insert(schema.screenshots)
      .values({
        url: data.url,
        image: result.screenshot,
        title: result.title,
        status: result.status,
        hasCaptcha: result.hasCaptcha,
        atsPlatform,
        actions: result.actions ? JSON.stringify(result.actions) : null,
      })
      .returning()

    return saved
  })

export const getScreenshots = createServerFn({ method: 'GET' }).handler(async () => {
  return db.select().from(schema.screenshots).orderBy(desc(schema.screenshots.createdAt))
})

export const deleteScreenshot = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    await db.delete(schema.screenshots).where(eq(schema.screenshots.id, data.id))
    return { success: true }
  })

// --- Parse resume text into profile suggestions ---

interface ParsedProfileSuggestion {
  firstName?: string
  lastName?: string
  email?: string
  phoneCountryCode?: string
  phone?: string
  linkedinUrl?: string
  currentLocation?: string
}

function parseResumeForProfile(text: string): ParsedProfileSuggestion {
  const result: ParsedProfileSuggestion = {}

  // Email — most reliable
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  if (emailMatch) result.email = emailMatch[0]

  // LinkedIn URL
  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i)
  if (linkedinMatch) {
    const url = linkedinMatch[0]
    result.linkedinUrl = url.startsWith('http') ? url : `https://${url}`
  }

  // Phone — international format with country code
  // Matches: +49 170 1234567, +49-170-1234567, +1 (555) 123-4567, etc.
  const phoneMatch = text.match(/(\+\d{1,3})[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,8}/)
  if (phoneMatch) {
    const fullPhone = phoneMatch[0]
    const countryCode = phoneMatch[1] // e.g. "+49"
    result.phoneCountryCode = countryCode
    // Rest of the number: strip country code, parens, and normalize
    result.phone = fullPhone.slice(countryCode.length).replace(/[()]/g, '').trim()
  }

  // Name — try first line of resume (very common convention)
  // Look for a line that's just 2-3 capitalized words near the top
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines.slice(0, 10)) {
    // Skip lines that look like contact info, addresses, or long text
    if (line.includes('@') || line.includes('http') || line.length > 40) continue
    if (/^\d/.test(line)) continue // Skip lines starting with numbers
    // Match "First Last" or "First Middle Last" pattern
    const nameMatch = line.match(/^([A-ZÄÖÜ][a-zäöüß]+)\s+(?:[A-ZÄÖÜ][a-zäöüß]+\s+)?([A-ZÄÖÜ][a-zäöüß]+)$/)
    if (nameMatch) {
      result.firstName = nameMatch[1]
      result.lastName = nameMatch[2]
      break
    }
  }

  // Location — look for city/country patterns near contact info (top of resume)
  const topText = lines.slice(0, 15).join(' ')
  // "Berlin, Germany" or "Munich, DE" or "Berlin | Germany"
  const locationMatch = topText.match(/\b([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)?)\s*[,|]\s*([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)?)\b/)
  if (locationMatch && !locationMatch[0].includes('@')) {
    // Verify it looks like a location (not a name) by checking common country/city names
    const possibleCountry = locationMatch[2].toLowerCase()
    const countries = ['germany', 'deutschland', 'austria', 'österreich', 'switzerland', 'schweiz', 'usa', 'uk', 'france', 'spain', 'italy', 'netherlands', 'canada', 'india']
    if (countries.some((c) => possibleCountry.includes(c)) || /^[A-Z]{2}$/.test(locationMatch[2])) {
      result.currentLocation = locationMatch[0]
    }
  }

  return result
}

export const parseResumeProfile = createServerFn({ method: 'GET' }).handler(async () => {
  const resume = await db
    .select({ extractedText: schema.uploads.extractedText })
    .from(schema.uploads)
    .where(eq(schema.uploads.category, 'resume'))
    .limit(1)

  if (!resume[0]?.extractedText) return null
  return parseResumeForProfile(resume[0].extractedText)
})

// --- Apply Profile CRUD ---

export type ApplyProfile = typeof schema.applyProfile.$inferSelect

export const getApplyProfile = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = await db.select().from(schema.applyProfile).limit(1)
  return rows[0] ?? null
})

export const saveApplyProfile = createServerFn({ method: 'POST' })
  .inputValidator((data: Omit<ApplyProfile, 'id' | 'updatedAt'>) => data)
  .handler(async ({ data }) => {
    const existing = await db.select().from(schema.applyProfile).limit(1)
    if (existing.length > 0) {
      const [updated] = await db
        .update(schema.applyProfile)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(eq(schema.applyProfile.id, existing[0].id))
        .returning()
      return updated
    }
    const [created] = await db.insert(schema.applyProfile).values(data).returning()
    return created
  })

// --- Fill Form ---

export interface FillFormResult {
  screenshot: string
  title: string | null
  url: string
  filled: { label: string; field: string; value: string; type: string }[]
  skipped: string[]
  actions: {
    dismissedCookies: boolean
    clickedApply: boolean
    applyButtonText: string | null
    navigatedTo: string | null
  }
  timeMs: number
}

export const fillForm = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string }) => data)
  .handler(async ({ data }): Promise<FillFormResult> => {
    // Load profile from DB
    const profiles = await db.select().from(schema.applyProfile).limit(1)
    if (!profiles[0]) {
      throw new Error('No apply profile configured. Please fill in your profile first.')
    }
    const profile = profiles[0]

    const res = await fetch(`${PLAYWRIGHT_URL}/fill-form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: data.url,
        profile: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          phone: [profile.phoneCountryCode, profile.phone].filter(Boolean).join(' ') || undefined,
          linkedinUrl: profile.linkedinUrl,
          city: profile.city,
          state: profile.state,
          country: profile.country,
          zipCode: profile.zipCode,
          currentLocation: [profile.city, profile.country].filter(Boolean).join(', ') || undefined,
          salaryExpectations: profile.salaryExpectations,
          availability: profile.availability,
          earliestStartDate: profile.earliestStartDate,
          workVisaStatus: profile.workVisaStatus,
          nationality: profile.nationality,
          gender: profile.gender,
          referralSource: profile.referralSource,
        },
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
    }

    const result = (await res.json()) as FillFormResult

    // Save the screenshot to DB
    const atsPlatform = classifyATS(data.url)
    await db.insert(schema.screenshots).values({
      url: result.url,
      image: result.screenshot,
      title: result.title,
      status: 'loaded',
      hasCaptcha: false,
      atsPlatform,
      actions: JSON.stringify({
        ...result.actions,
        formFilled: result.filled,
        formSkipped: result.skipped,
      }),
    })

    return result
  })
