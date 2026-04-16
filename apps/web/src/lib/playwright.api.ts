import { createServerFn } from '@tanstack/react-start'
import { classifyATS } from '@job-app-bot/shared/ats-classifier'
import type { ProbeResult, JobDescription, LinkedInSearchResult, LinkedInSearchMeta, LinkedInWorkType, LinkedInDatePosted } from '@job-app-bot/shared'
import { db, schema } from '@job-app-bot/db'
import { eq, desc } from 'drizzle-orm'
import { parseJobDescription } from './description-parser.ts'
import { parseLocation } from './location-parser.ts'
import { callClaudeCli, callCopilotCli, getActiveCliProvider, getCliProgress, setCliProgress, clearCliProgress } from './claude-cli.server.ts'
import { readAllResumeTexts, readResumeTextsByName } from './uploads.server.ts'
import { getConfigValue } from './config.server.ts'

const LLM_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8083'

const PLAYWRIGHT_URL = process.env.PLAYWRIGHT_SERVICE_URL || 'http://localhost:8084'

interface LinkedInCredentials {
  email: string
  password: string
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return 'saved'
  if (local.length <= 2) return `${local[0] || '*'}*@${domain}`
  return `${local.slice(0, 2)}***@${domain}`
}

async function getLinkedInCredentialsWithEnvFallback(): Promise<LinkedInCredentials | null> {
  const saved = await db.select().from(schema.linkedinCredentials).limit(1)
  if (saved[0]?.email && saved[0]?.password) {
    return { email: saved[0].email, password: saved[0].password }
  }

  const envEmail = process.env.LINKEDIN_EMAIL?.trim()
  const envPassword = process.env.LINKEDIN_PASSWORD?.trim()
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword }
  }
  return null
}

export const getPlaywrightStatus = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const res = await fetch(`${PLAYWRIGHT_URL}/health`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { connected: false, status: 'error' as const }
    return { connected: true, ...(await res.json()) }
  } catch {
    return { connected: false, status: 'unreachable' as const }
  }
})

export const getLinkedInCredentialsStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const saved = await db.select().from(schema.linkedinCredentials).limit(1)
  if (saved[0]?.email && saved[0]?.password) {
    return {
      source: 'settings' as const,
      configured: true,
      maskedEmail: maskEmail(saved[0].email),
      updatedAt: saved[0].updatedAt,
    }
  }
  const envEmail = process.env.LINKEDIN_EMAIL?.trim()
  const envPassword = process.env.LINKEDIN_PASSWORD?.trim()
  if (envEmail && envPassword) {
    return {
      source: 'env' as const,
      configured: true,
      maskedEmail: maskEmail(envEmail),
      updatedAt: null,
    }
  }
  return { source: 'none' as const, configured: false, maskedEmail: null, updatedAt: null }
})

export const saveLinkedInCredentials = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim()
    const password = data.password.trim()
    if (!email || !password) {
      throw new Error('Email and password are required')
    }

    const existing = await db.select().from(schema.linkedinCredentials).limit(1)
    if (existing[0]) {
      await db.update(schema.linkedinCredentials).set({
        email,
        password,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.linkedinCredentials.id, existing[0].id))
    } else {
      await db.insert(schema.linkedinCredentials).values({
        email,
        password,
        updatedAt: new Date().toISOString(),
      })
    }
    return { ok: true }
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
  .inputValidator((data: { url: string; sessionId?: string }) => data)
  .handler(async ({ data }): Promise<Screenshot> => {
    const res = await fetch(`${PLAYWRIGHT_URL}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: data.url, sessionId: data.sessionId }),
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

// --- CLI-based profile parsing (Claude / Copilot / Local LLM) ---

const PARSE_PROFILE_PROMPT = `You are an expert resume parser. Extract personal/contact information from the resume text below.

Return ONLY a valid JSON object with these fields (use null for any field you cannot find):
{
  "firstName": "string or null",
  "lastName": "string or null",
  "email": "string or null",
  "phoneCountryCode": "string like +1, +49, etc. or null",
  "phone": "string (number without country code) or null",
  "linkedinUrl": "string or null",
  "city": "string or null",
  "state": "string or null",
  "country": "string or null",
  "zipCode": "string or null"
}

Be precise: extract only what is explicitly stated. Do not guess or infer missing fields.
Parse the following resume:`

let activeProfileParseSessionId: string | null = null

export const getProfileParseProgress = createServerFn({ method: 'GET' }).handler(async () => {
  if (!activeProfileParseSessionId) return { step: null, elapsedMs: 0 }
  const progress = getCliProgress(activeProfileParseSessionId)
  return progress || { step: null, elapsedMs: 0 }
})

export const parseResumeProfileWithCli = createServerFn({ method: 'POST' })
  .inputValidator((data: { resumeNames?: string[] }) => data)
  .handler(async ({ data }) => {
    const sessionId = crypto.randomUUID()
    activeProfileParseSessionId = sessionId

    setCliProgress(sessionId, 'Reading uploaded resumes...')
    const resumeText = data.resumeNames && data.resumeNames.length > 0
      ? await readResumeTextsByName(data.resumeNames)
      : await readAllResumeTexts()
    if (!resumeText.trim()) {
      clearCliProgress(sessionId)
      activeProfileParseSessionId = null
      throw new Error('No resume text found. Upload at least one resume first.')
    }

    setCliProgress(sessionId, `Loaded ${Math.round(resumeText.length / 1024)}KB of resume text`)
    const activeProvider = await getActiveCliProvider()

    let responseText: string
    let durationMs: number

    if (activeProvider === 'claude' || activeProvider === 'copilot') {
      const isCopilot = activeProvider === 'copilot'
      const label = isCopilot ? 'Copilot' : 'Claude'
      setCliProgress(sessionId, `Sending to ${label} CLI...`)

      const response = isCopilot
        ? await callCopilotCli(PARSE_PROFILE_PROMPT + '\n\n' + resumeText, { sessionId })
        : await callClaudeCli(PARSE_PROFILE_PROMPT + '\n\n' + resumeText, { sessionId })

      responseText = response.text
      durationMs = response.durationMs
    } else {
      // Local LLM service
      setCliProgress(sessionId, 'Sending to local LLM service...')
      const provider = await getConfigValue('active_provider')
      const modelId = await getConfigValue('active_model_id')
      const cliPath = await getConfigValue('claude_cli_path')
      const providerFields: Record<string, string> = {}
      if (provider === 'claude' && modelId) {
        providerFields.model_id = modelId.startsWith('claude/') ? modelId : `claude/${modelId}`
        if (cliPath) providerFields.cli_path = cliPath
      }

      const res = await fetch(`${LLM_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: PARSE_PROFILE_PROMPT + '\n\n' + resumeText, ...providerFields }),
        signal: AbortSignal.timeout(120000),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { detail?: string }).detail || `LLM parse failed: HTTP ${res.status}`)
      }

      const result = await res.json() as { text: string; generation_time_s: number }
      responseText = result.text
      durationMs = result.generation_time_s * 1000
    }

    setCliProgress(sessionId, 'Parsing response...')

    // Extract JSON object from response (strip markdown code blocks if present)
    const codeBlockMatch = responseText.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) responseText = codeBlockMatch[1]
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      clearCliProgress(sessionId)
      activeProfileParseSessionId = null
      throw new Error('LLM did not return a JSON object. Response: ' + responseText.slice(0, 300))
    }

    let parsed: Record<string, string | null>
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch (e) {
      clearCliProgress(sessionId)
      activeProfileParseSessionId = null
      throw new Error(`Failed to parse JSON: ${e}`)
    }

    clearCliProgress(sessionId)
    activeProfileParseSessionId = null

    return {
      firstName: parsed.firstName || null,
      lastName: parsed.lastName || null,
      email: parsed.email || null,
      phoneCountryCode: parsed.phoneCountryCode || null,
      phone: parsed.phone || null,
      linkedinUrl: parsed.linkedinUrl || null,
      city: parsed.city || null,
      state: parsed.state || null,
      country: parsed.country || null,
      zipCode: parsed.zipCode || null,
      durationMs,
    }
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

export interface SkippedField {
  label: string
  type: 'text' | 'textarea' | 'select' | 'file' | 'checkbox'
  required: boolean
  options?: string[]
  selector?: string
}

export interface FillFormResult {
  screenshot: string
  title: string | null
  url: string
  filled: { label: string; field: string; value: string; type: string }[]
  skipped: SkippedField[]
  actions: {
    dismissedCookies: boolean
    clickedApply: boolean
    applyButtonText: string | null
    navigatedTo: string | null
  }
  timeMs: number
}

export const fillForm = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string; sessionId?: string }) => data)
  .handler(async ({ data }): Promise<FillFormResult> => {
    // Load profile from DB
    const profiles = await db.select().from(schema.applyProfile).limit(1)
    if (!profiles[0]) {
      throw new Error('No apply profile configured. Please fill in your profile first.')
    }
    const profile = profiles[0]
    const atsPlatform = classifyATS(data.url)

    // Route Workday URLs to the handler-based /apply endpoint
    // (Workday uses custom components that don't work with generic DOM scanning)
    if (atsPlatform === 'workday') {
      return fillFormViaHandler(data.url, profile, atsPlatform)
    }

    const res = await fetch(`${PLAYWRIGHT_URL}/fill-form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: data.url,
        sessionId: data.sessionId,
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

/** Route Workday (and future complex ATS) URLs through the handler-based /apply endpoint */
async function fillFormViaHandler(
  url: string,
  profile: typeof schema.applyProfile.$inferSelect,
  atsPlatform: string,
): Promise<FillFormResult> {
  const applyProfile = await buildApplyProfile(profile)

  // First attempt — try applying directly
  const result = await callApplyEndpoint(url, applyProfile)

  // If auth is required, attempt the full Workday auth flow
  if (result.status === 'needs_manual' && result.reason?.includes('login')) {
    const authResult = await workdayAuthFlow(url, profile.email)
    if (authResult.success) {
      // Retry the apply after successful auth
      const retryResult = await callApplyEndpoint(url, applyProfile)
      return mapHandlerResult(url, 'workday', atsPlatform, retryResult)
    }
    // Auth failed — return the auth error info
    return mapHandlerResult(url, 'workday', atsPlatform, {
      status: 'needs_manual',
      reason: authResult.message,
      screenshot: authResult.screenshot,
    })
  }

  return mapHandlerResult(url, 'workday', atsPlatform, result)
}

async function buildApplyProfile(profile: typeof schema.applyProfile.$inferSelect): Promise<Record<string, unknown>> {
  const applyProfile: Record<string, unknown> = {
    fullName: [profile.firstName, profile.lastName].filter(Boolean).join(' '),
    email: profile.email,
    phone: [profile.phoneCountryCode, profile.phone].filter(Boolean).join(' ') || '',
    linkedinUrl: profile.linkedinUrl || '',
    resumePath: '',
    firstName: profile.firstName,
    lastName: profile.lastName,
    city: profile.city,
    state: profile.state,
    zipCode: profile.zipCode,
    country: profile.country,
  }

  const resumeRows = await db
    .select({ name: schema.uploads.name })
    .from(schema.uploads)
    .where(eq(schema.uploads.category, 'resume'))
    .limit(1)
  if (resumeRows[0]) {
    const { resolve } = await import('path')
    const dataDir = process.env.DATA_DIR || './data'
    applyProfile.resumePath = resolve(dataDir, 'uploads', 'resume', resumeRows[0].name)
  }

  return applyProfile
}

interface HandlerResult {
  status: string
  reason?: string
  screenshot?: string
  filledFields?: string[]
  skippedFields?: string[]
  errorContext?: string
}

async function callApplyEndpoint(url: string, applyProfile: Record<string, unknown>): Promise<HandlerResult> {
  const res = await fetch(`${PLAYWRIGHT_URL}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, profile: applyProfile }),
    signal: AbortSignal.timeout(120000),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
  }

  const json = (await res.json()) as { handler: string; result: HandlerResult }
  return json.result
}

/**
 * Full Workday authentication flow:
 * 1. Try to create account / sign in via Playwright
 * 2. If verification email needed, poll Gmail for it
 * 3. Visit verification link and sign in
 */
async function workdayAuthFlow(
  jobUrl: string,
  email: string,
): Promise<{ success: boolean; message: string; screenshot?: string }> {
  // Generate a strong password for this Workday instance
  const password = generateWorkdayPassword()

  // Step 1: Create account or sign in
  const createRes = await fetch(`${PLAYWRIGHT_URL}/workday/create-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: jobUrl, email, password }),
    signal: AbortSignal.timeout(60000),
  })

  const createJson = (await createRes.json()) as {
    status: string
    message: string
    screenshot?: string
  }

  if (createJson.status === 'signed_in' || createJson.status === 'no_auth_required') {
    return { success: true, message: createJson.message, screenshot: createJson.screenshot }
  }

  if (createJson.status !== 'verification_needed') {
    return { success: false, message: createJson.message, screenshot: createJson.screenshot }
  }

  // Step 2: Poll Gmail for verification email (try up to 6 times over ~90 seconds)
  const { findWorkdayVerificationEmail } = await import('./gmail.server.ts')

  let verificationLink: string | null = null
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 5000 : 15000))

    const emailResult = await findWorkdayVerificationEmail(5)
    if (emailResult.found && emailResult.verificationLink) {
      verificationLink = emailResult.verificationLink
      console.log(`[workday-auth] Found verification email: ${emailResult.subject}`)
      break
    }
    console.log(`[workday-auth] Polling for verification email... attempt ${attempt + 1}/6`)
  }

  if (!verificationLink) {
    return {
      success: false,
      message: 'Workday account created but verification email not found in Gmail within 90 seconds',
      screenshot: createJson.screenshot,
    }
  }

  // Step 3: Visit verification link and sign in
  const verifyRes = await fetch(`${PLAYWRIGHT_URL}/workday/verify-and-signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verificationLink, jobUrl, email, password }),
    signal: AbortSignal.timeout(60000),
  })

  const verifyJson = (await verifyRes.json()) as {
    status: string
    message: string
    screenshot?: string
  }

  return {
    success: verifyJson.status === 'ready' || verifyJson.status === 'signed_in',
    message: verifyJson.message,
    screenshot: verifyJson.screenshot,
  }
}

/** Generate a password that meets Workday requirements (8+ chars, uppercase, lowercase, number, special) */
function generateWorkdayPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const nums = '23456789'
  const special = '!@#$%&*'
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  // Ensure at least one of each required type
  const parts = [
    pick(upper), pick(upper),
    pick(chars), pick(chars), pick(chars), pick(chars),
    pick(nums), pick(nums),
    pick(special),
  ]
  // Shuffle
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[parts[i], parts[j]] = [parts[j], parts[i]]
  }
  return parts.join('')
}

async function mapHandlerResult(
  url: string,
  handler: string,
  atsPlatform: string,
  result: HandlerResult,
): Promise<FillFormResult> {
  // Save screenshot if one was returned
  if (result.screenshot) {
    await db.insert(schema.screenshots).values({
      url,
      image: result.screenshot,
      title: `Workday Apply: ${result.status}`,
      status: result.status === 'applied' ? 'loaded' : 'error',
      hasCaptcha: result.status === 'captcha_blocked',
      atsPlatform,
      actions: JSON.stringify({
        handler,
        status: result.status,
        reason: result.reason,
        filledFields: result.filledFields,
        skippedFields: result.skippedFields,
      }),
    })
  }

  return {
    screenshot: result.screenshot || '',
    title: `Workday: ${result.status}`,
    url,
    filled: (result.filledFields || []).map((f) => ({
      label: f,
      field: f,
      value: '(filled)',
      type: 'text',
    })),
    skipped: (result.skippedFields || []).map((label) => ({
      label,
      type: 'text' as const,
      required: true,
    })),
    actions: {
      dismissedCookies: false,
      clickedApply: result.status === 'applied',
      applyButtonText: null,
      navigatedTo: url,
    },
    timeMs: 0,
  }
}

// --- Job Description Scraping ---

export const getJobDescriptions = createServerFn({ method: 'GET' }).handler(async (): Promise<Record<string, JobDescription>> => {
  const rows = await db.select().from(schema.jobDescriptions)
  const map: Record<string, JobDescription> = {}
  for (const row of rows) {
    map[row.jobUrl] = {
      jobUrl: row.jobUrl,
      raw: row.raw,
      skills: row.skills,
      companyInfo: row.companyInfo,
      pay: row.pay,
      other: row.other,
      language: (row.language as JobDescription['language']) || 'unknown',
      scrapedAt: row.scrapedAt,
    }
  }
  return map
})

export const scrapeOneJobDescription = createServerFn({ method: 'POST' })
  .inputValidator((data: { jobUrl: string }) => data)
  .handler(async ({ data }): Promise<JobDescription> => {
    const res = await fetch(`${PLAYWRIGHT_URL}/scrape-description`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: data.jobUrl }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
    }

    const result = (await res.json()) as { text: string; title: string | null; url: string; timeMs: number }

    if (!result.text || result.text.length < 20) {
      throw new Error('Could not extract job description text from the page')
    }

    const parsed = parseJobDescription(result.text)

    // Upsert into job_descriptions
    const existing = await db
      .select()
      .from(schema.jobDescriptions)
      .where(eq(schema.jobDescriptions.jobUrl, data.jobUrl))
      .limit(1)

    const values = {
      jobUrl: data.jobUrl,
      raw: result.text,
      skills: parsed.skills,
      companyInfo: parsed.companyInfo,
      pay: parsed.pay,
      other: parsed.other,
      language: parsed.language,
      scrapedAt: new Date().toISOString(),
    }

    if (existing.length > 0) {
      await db
        .update(schema.jobDescriptions)
        .set(values)
        .where(eq(schema.jobDescriptions.jobUrl, data.jobUrl))
    } else {
      await db.insert(schema.jobDescriptions).values(values)
    }

    return values
  })

// --- LinkedIn Job Search ---

/** Query existing jobs from DB to send as a dedup list to the Playwright scraper */
async function getKnownJobsForDedup(): Promise<{ knownJobs: { company: string; role: string }[]; knownUrls: string[] }> {
  const rows = await db
    .select({
      company: schema.jobs.company,
      role: schema.jobs.role,
      jobUrl: schema.jobs.jobUrl,
      sourceUrl: schema.jobs.sourceUrl,
    })
    .from(schema.jobs)
  const knownJobs: { company: string; role: string }[] = []
  const knownUrls: string[] = []
  for (const row of rows) {
    if (row.company && row.role) {
      knownJobs.push({ company: row.company, role: row.role })
    }
    if (row.jobUrl) knownUrls.push(row.jobUrl)
    if (row.sourceUrl) knownUrls.push(row.sourceUrl)
  }
  return { knownJobs, knownUrls }
}

export const searchLinkedInJobs = createServerFn({ method: 'POST' })
  .inputValidator((data: { keywords: string; location: string; skills: string[]; maxResults?: number; mode?: 'scan' | 'find_matches'; targetMatches?: number; minSkillMatch?: number; workTypes?: LinkedInWorkType[]; datePosted?: LinkedInDatePosted; sessionId?: string; excludeGerman?: boolean; searchLimit?: number }) => data)
  .handler(async ({ data }): Promise<{ status: string; results: LinkedInSearchResult[]; message?: string; screenshot?: string; meta?: LinkedInSearchMeta; logs?: string[]; sessionId?: string; retryAfterMs?: number }> => {
    const credentials = await getLinkedInCredentialsWithEnvFallback()
    if (!credentials) {
      return {
        status: 'auth_error',
        results: [],
        message: 'LinkedIn credentials are not configured. Add them in Settings > LinkedIn (or set LINKEDIN_EMAIL/LINKEDIN_PASSWORD).',
      }
    }

    const dedup = await getKnownJobsForDedup()

    // find_matches mode scans many more cards across pages, needs longer timeout
    const timeout = data.mode === 'find_matches'
      ? (data.searchLimit === 0 ? 600000 : Math.max(180000, (data.searchLimit || 50) * 5000))
      : Math.max(120000, (data.maxResults || 5) * 25000)

    const res = await fetch(`${PLAYWRIGHT_URL}/linkedin-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        maxResults: data.maxResults || 5,
        mode: data.mode || 'scan',
        targetMatches: data.targetMatches,
        minSkillMatch: data.minSkillMatch,
        workTypes: data.workTypes,
        excludeGerman: data.excludeGerman,
        searchLimit: data.searchLimit,
        linkedinEmail: credentials.email,
        linkedinPassword: credentials.password,
        knownJobs: dedup.knownJobs,
        knownUrls: dedup.knownUrls,
      }),
      signal: AbortSignal.timeout(timeout),
    })

    const json = await res.json()

    if (!res.ok) {
      return { status: json.status || 'error', results: [], message: json.message || 'Search failed', screenshot: json.screenshot, logs: json.logs, retryAfterMs: json.retryAfterMs }
    }

    return json
  })

/**
 * Start a LinkedIn search with SSE streaming support.
 * Fires the POST to Playwright with a sessionId (fire-and-forget),
 * then returns the sessionId so the browser can connect to the SSE stream.
 */
export const startLinkedInSearchStream = createServerFn({ method: 'POST' })
  .inputValidator((data: { keywords: string; location: string; skills: string[]; maxResults?: number; mode?: 'scan' | 'find_matches'; targetMatches?: number; minSkillMatch?: number; workTypes?: LinkedInWorkType[]; datePosted?: LinkedInDatePosted }) => data)
  .handler(async ({ data }): Promise<{ sessionId: string } | { error: string }> => {
    const credentials = await getLinkedInCredentialsWithEnvFallback()
    if (!credentials) {
      return { error: 'LinkedIn credentials are not configured. Add them in Settings > LinkedIn (or set LINKEDIN_EMAIL/LINKEDIN_PASSWORD).' }
    }

    const dedup = await getKnownJobsForDedup()
    const sessionId = crypto.randomUUID()

    const timeout = data.mode === 'find_matches'
      ? 180000
      : Math.max(120000, (data.maxResults || 5) * 25000)

    // Fire and forget — the SSE stream will deliver progress/results
    fetch(`${PLAYWRIGHT_URL}/linkedin-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        maxResults: data.maxResults || 5,
        mode: data.mode || 'scan',
        targetMatches: data.targetMatches,
        minSkillMatch: data.minSkillMatch,
        workTypes: data.workTypes,
        linkedinEmail: credentials.email,
        linkedinPassword: credentials.password,
        knownJobs: dedup.knownJobs,
        knownUrls: dedup.knownUrls,
        sessionId,
      }),
      signal: AbortSignal.timeout(timeout),
    }).catch((err) => console.error('Streaming search POST failed:', err))

    return { sessionId }
  })

export const addLinkedInJobToTracker = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    title: string
    company: string
    url: string
    externalUrl?: string
    location: string
    workType?: 'remote' | 'hybrid' | 'onsite' | 'unknown'
    recruiterEmail?: string
    recruiterPhone?: string
    sponsorshipMentioned?: boolean
    sponsorshipPolicy?: 'supports' | 'no_support' | 'unknown'
    sponsorshipSnippet?: string
  }) => data)
  .handler(async ({ data }) => {
    const { ensureJobSearchTab, appendToJobSearchTab } = await import('./sheets.server.ts')
    const now = new Date().toISOString()
    const today = now.split('T')[0]
    const externalUrl = data.externalUrl && !data.externalUrl.includes('linkedin.com') ? data.externalUrl : undefined
    const jobUrl = externalUrl || data.url
    const sourceUrl = data.url // always the LinkedIn URL

    // Parse structured location from freeform string
    const loc = parseLocation(data.location)

    // Insert into local DB with dual URLs and searchedAt
    const [inserted] = await db.insert(schema.jobs).values({
      company: data.company,
      role: data.title,
      jobUrl,
      sourceUrl,
      recruiterLinkedin: data.url,
      recruiterEmail: data.recruiterEmail || null,
      recruiterPhone: data.recruiterPhone || null,
      location: data.location,
      country: loc.country || null,
      state: loc.state || null,
      city: loc.city || null,
      date: today,
      source: 'linkedin',
      atsPlatform: data.externalUrl ? classifyATS(data.externalUrl) : 'linkedin',
      activityStatus: 'New',
      applicationStatus: 'Not Applied',
      searchedAt: now,
    }).returning()

    // Write to unified "Job Search" sheet tab
    try {
      await ensureJobSearchTab()
      await appendToJobSearchTab([{
        company: data.company,
        role: data.title,
        platform: 'linkedin',
        jobUrl,
        sourceUrl,
        country: loc.country,
        state: loc.state,
        city: loc.city,
        workType: data.workType || '',
        sponsorship: data.sponsorshipPolicy || '',
        recruiterEmail: data.recruiterEmail || '',
        recruiterPhone: data.recruiterPhone || '',
        status: 'new',
        searchedAt: now,
        date: today,
      }])
    } catch (err) {
      console.error('Failed to write to Google Sheet (job was still saved locally):', err)
    }

    return inserted
  })

export const saveLinkedInSearchResults = createServerFn({ method: 'POST' })
  .inputValidator((data: { results: LinkedInSearchResult[]; searchKeywords: string; city?: string; country?: string; skills?: string; logs?: string[]; meta?: LinkedInSearchMeta; mode?: 'scan' | 'find_matches'; sessionId?: string }) => data)
  .handler(async ({ data }) => {
    const now = new Date().toISOString()
    const today = now.split('T')[0]

    // Insert into local DB jobs table (skip duplicates by jobUrl or sourceUrl)
    let savedCount = 0
    const { or } = await import('drizzle-orm')
    for (const r of data.results) {
      const cleanExternalUrl = r.externalUrl && !r.externalUrl.includes('linkedin.com') ? r.externalUrl : undefined
      const jobUrl = cleanExternalUrl || r.url
      const sourceUrl = r.url

      // Check both jobUrl and sourceUrl for duplicates
      const existing = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(or(eq(schema.jobs.jobUrl, jobUrl), eq(schema.jobs.sourceUrl, sourceUrl)))
        .limit(1)

      if (existing.length === 0) {
        const loc = parseLocation(r.location)
        await db.insert(schema.jobs).values({
          company: r.company,
          role: r.title,
          jobUrl,
          sourceUrl,
          recruiterLinkedin: r.url,
          recruiterEmail: r.recruiterEmail || null,
          recruiterPhone: r.recruiterPhone || null,
          location: r.location,
          country: loc.country || null,
          state: loc.state || null,
          city: loc.city || null,
          date: today,
          source: 'linkedin',
          atsPlatform: cleanExternalUrl ? classifyATS(cleanExternalUrl) : 'linkedin',
          activityStatus: 'New',
          applicationStatus: 'Not Applied',
          searchedAt: now,
        })
        savedCount++
      }
    }

    // Persist the search session with results (sheet write happens on individual "Add" clicks)
    try {
      await db.insert(schema.linkedinSearches).values({
        keywords: data.searchKeywords,
        city: data.city || null,
        country: data.country || null,
        skills: data.skills || null,
        resultsCount: data.results.length,
        savedCount,
        totalAvailable: data.meta?.totalAvailable ?? null,
        results: JSON.stringify(data.results),
        logs: data.logs ? JSON.stringify(data.logs) : null,
        savedToSheet: false,
        hasRecording: !!data.sessionId,
        searchedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Failed to save search session (jobs and sheet were still saved):', err)
    }

    return { savedCount, totalResults: data.results.length }
  })

export type LinkedInSearch = typeof schema.linkedinSearches.$inferSelect

export const getLinkedInSearches = createServerFn({ method: 'GET' }).handler(async () => {
  return db.select().from(schema.linkedinSearches).orderBy(desc(schema.linkedinSearches.searchedAt)).limit(50)
})

// --- LinkedIn Easy Apply ---

export interface EasyApplyResult {
  status: 'applied' | 'review_needed' | 'failed' | 'no_easy_apply' | 'error'
  stepsCompleted: number
  answeredQuestions: { label: string; value: string; type: string }[]
  unansweredQuestions: { label: string; type: string; options?: string[]; required: boolean }[]
  screenshot?: string
  error?: string
  message?: string
}

export const linkedInEasyApply = createServerFn({ method: 'POST' })
  .inputValidator((data: { jobUrl: string; jobId?: number; dryRun?: boolean }) => data)
  .handler(async ({ data }): Promise<EasyApplyResult> => {
    const credentials = await getLinkedInCredentialsWithEnvFallback()
    if (!credentials) {
      return {
        status: 'error',
        stepsCompleted: 0,
        answeredQuestions: [],
        unansweredQuestions: [],
        message: 'LinkedIn credentials are not configured. Add them in Settings > LinkedIn (or set LINKEDIN_EMAIL/LINKEDIN_PASSWORD).',
      }
    }

    // Load profile from DB
    const profiles = await db.select().from(schema.applyProfile).limit(1)
    if (!profiles[0]) {
      throw new Error('No apply profile configured. Please fill in your profile first.')
    }
    const profile = profiles[0]

    // Resolve resume path
    let resumePath = ''
    const resumeRows = await db
      .select({ name: schema.uploads.name })
      .from(schema.uploads)
      .where(eq(schema.uploads.category, 'resume'))
      .limit(1)
    if (resumeRows[0]) {
      const { resolve } = await import('path')
      const dataDir = process.env.DATA_DIR || './data'
      resumePath = resolve(dataDir, 'uploads', 'resume', resumeRows[0].name)
    }

    const easyApplyProfile = {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone || undefined,
      phoneCountryCode: profile.phoneCountryCode || undefined,
      linkedinUrl: profile.linkedinUrl || undefined,
      city: profile.city || undefined,
      state: profile.state || undefined,
      country: profile.country || undefined,
      zipCode: profile.zipCode || undefined,
      currentLocation: [profile.city, profile.country].filter(Boolean).join(', ') || undefined,
      salaryExpectations: profile.salaryExpectations || undefined,
      availability: profile.availability || undefined,
      earliestStartDate: profile.earliestStartDate || undefined,
      workVisaStatus: profile.workVisaStatus || undefined,
      nationality: profile.nationality || undefined,
      gender: profile.gender || undefined,
      referralSource: profile.referralSource || undefined,
      resumePath: resumePath || undefined,
    }

    const res = await fetch(`${PLAYWRIGHT_URL}/linkedin-easy-apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobUrl: data.jobUrl,
        profile: easyApplyProfile,
        dryRun: data.dryRun,
        linkedinEmail: credentials.email,
        linkedinPassword: credentials.password,
      }),
      signal: AbortSignal.timeout(120000),
    })

    const json = await res.json() as EasyApplyResult

    // Save screenshot if returned
    let screenshotId: number | undefined
    if (json.screenshot) {
      try {
        const [saved] = await db.insert(schema.screenshots).values({
          jobId: data.jobId || null,
          url: data.jobUrl,
          image: json.screenshot,
          title: `Easy Apply: ${json.status}`,
          status: json.status === 'applied' ? 'loaded' : 'error',
          hasCaptcha: false,
          atsPlatform: 'linkedin',
          actions: JSON.stringify({
            handler: 'linkedin-easy-apply',
            status: json.status,
            stepsCompleted: json.stepsCompleted,
            answeredCount: json.answeredQuestions?.length || 0,
            unansweredCount: json.unansweredQuestions?.length || 0,
          }),
        }).returning()
        screenshotId = saved.id
      } catch { /* screenshot save failed */ }
    }

    // Save question tracking data
    try {
      const { saveFormQuestions } = await import('./questions.api.ts')
      const questions = [
        ...(json.answeredQuestions || []).map((q) => ({
          label: q.label,
          value: q.value,
          type: q.type as any,
          status: 'answered' as const,
        })),
        ...(json.unansweredQuestions || []).map((q) => ({
          label: q.label,
          type: q.type as any,
          options: q.options,
          required: q.required,
          status: 'unanswered' as const,
        })),
      ]
      if (questions.length > 0) {
        await saveFormQuestions({ data: { questions, platform: 'linkedin', jobUrl: data.jobUrl, jobId: data.jobId } })
      }
    } catch (err) {
      console.error('Failed to save form questions:', err)
    }

    // Log error if failed
    if (json.status === 'failed' || json.status === 'error' || json.status === 'no_easy_apply') {
      try {
        const { logApplyError } = await import('./error-log.api.ts')
        const errorType = json.status === 'no_easy_apply' ? 'no_easy_apply'
          : json.error?.includes('captcha') ? 'captcha'
          : json.error?.includes('login') ? 'login_expired'
          : json.error?.includes('stuck') ? 'form_stuck'
          : json.error?.includes('timeout') ? 'timeout'
          : 'unknown'
        await logApplyError({
          data: {
            jobId: data.jobId,
            jobUrl: data.jobUrl,
            handler: 'linkedin-easy-apply',
            errorType,
            errorMessage: json.error || json.message || json.status,
            screenshotId,
            stepsCompleted: json.stepsCompleted,
          },
        })
      } catch (err) {
        console.error('Failed to log apply error:', err)
      }
    }

    // Update job status if applied
    if (json.status === 'applied' && data.jobId) {
      try {
        await db.update(schema.jobs).set({
          applicationStatus: 'Applied',
          appliedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.jobs.id, data.jobId))
      } catch { /* job update failed */ }
    }

    return json
  })

export const testLinkedInLogin = createServerFn({ method: 'POST' })
  .inputValidator((data: { waitForVerification?: boolean; sessionId?: string }) => data)
  .handler(async ({ data }): Promise<{ status: string; message: string }> => {
    const credentials = await getLinkedInCredentialsWithEnvFallback()
    if (!credentials) {
      return {
        status: 'not_configured',
        message: 'LinkedIn credentials are not configured. Add them in Settings > LinkedIn (or set LINKEDIN_EMAIL/LINKEDIN_PASSWORD).',
      }
    }

    const res = await fetch(`${PLAYWRIGHT_URL}/linkedin-login-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        waitForVerification: data.waitForVerification ?? false,
        linkedinEmail: credentials.email,
        linkedinPassword: credentials.password,
        sessionId: data.sessionId,
      }),
      signal: AbortSignal.timeout(data.waitForVerification ? 90000 : 60000),
    })
    return res.json()
  })
