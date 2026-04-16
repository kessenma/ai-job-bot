import { createServerFn } from '@tanstack/react-start'
import {
  listExperienceEntries,
  upsertExperienceEntry,
  deleteExperienceEntry,
} from './experience.server.ts'
import type { ExperienceEntry, ExperienceCategory } from './experience.server.ts'
import { readAllResumeTexts, readResumeTextsByName } from './uploads.server.ts'
import { getConfigValue } from './config.server.ts'
import { callClaudeCli, callCopilotCli, getActiveCliProvider, getCliProgress, setCliProgress, clearCliProgress } from './claude-cli.server.ts'

const LLM_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8083'

export type { ExperienceEntry, ExperienceCategory }

export const getExperienceEntries = createServerFn({ method: 'GET' }).handler(async () => {
  return listExperienceEntries()
})

export const saveExperienceEntry = createServerFn({ method: 'POST' })
  .inputValidator((data: ExperienceEntry) => data)
  .handler(async ({ data }) => {
    return upsertExperienceEntry(data)
  })

export const removeExperienceEntry = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    return deleteExperienceEntry(data.id)
  })

// Same prompt used by the Python LLM service's /parse-resume endpoint
const PARSE_RESUME_PROMPT = `You are an expert resume parser. Extract ALL structured entries from the ENTIRE resume text.
This includes: work experience, sabbaticals/career breaks, key projects, education, and publications.

For each entry, extract: company name, role/title, start date (YYYY-MM), end date (YYYY-MM, or null if current — words like 'Present', 'Current', 'Ongoing' mean null), description, and a list of skills/technologies mentioned.

How to map different resume sections into the schema:
- Work experience: company = employer name, role = job title
- Sabbatical/career break: company = 'Sabbatical', role = 'Career Break'
- Key projects: company = project name, role = 'Project'
- Education: company = university/school name, role = degree (e.g. 'B.S. Information'), use year dates
- Publications: company = 'Publications', role = 'Author', each publication as a bullet in description

IMPORTANT: For the description field, preserve the original bullet points exactly as written in the resume. Use a newline-separated list with '- ' prefix for each bullet. Do NOT summarize or combine bullets into prose. Copy each bullet point verbatim from the resume.

Respond with ONLY a valid JSON array of objects. Each object must have these fields:
{"company": "...", "role": "...", "start_date": "YYYY-MM", "end_date": "YYYY-MM or null", "description": "- bullet 1\\n- bullet 2\\n- bullet 3", "skills": ["..."]}

CRITICAL: If the end date says 'Present', 'Current', 'Ongoing', or similar, set end_date to null — do NOT use the start_date or any date value.
If dates are ambiguous (e.g. just a year), use YYYY-01 as the month. Parse the ENTIRE resume from top to bottom — do not stop early or skip sections.
If no entries can be found, return an empty array [].

Parse the following resume and extract ALL entries (experience, projects, education, publications):`

/**
 * Parse all uploaded resumes into structured experience entries using the LLM.
 * Claude CLI: called directly from web server (no Docker LLM service needed).
 * Local LLM: routed through the Python LLM service.
 */
// Active parse session ID for progress tracking
let activeParseSessionId: string | null = null

export const getParseProgress = createServerFn({ method: 'GET' }).handler(async () => {
  if (!activeParseSessionId) return { step: null, elapsedMs: 0 }
  const progress = getCliProgress(activeParseSessionId)
  return progress || { step: null, elapsedMs: 0 }
})

export const parseResumesWithLlm = createServerFn({ method: 'POST' })
  .inputValidator((data: { resumeNames?: string[] }) => data)
  .handler(async ({ data }) => {
  const sessionId = crypto.randomUUID()
  activeParseSessionId = sessionId

  setCliProgress(sessionId, 'Reading uploaded resumes...')
  const resumeText = data.resumeNames && data.resumeNames.length > 0
    ? await readResumeTextsByName(data.resumeNames)
    : await readAllResumeTexts()
  if (!resumeText.trim()) {
    clearCliProgress(sessionId)
    activeParseSessionId = null
    throw new Error('No resume text found. Upload at least one resume first.')
  }

  setCliProgress(sessionId, `Loaded ${Math.round(resumeText.length / 1024)}KB of resume text`)
  const activeProvider = await getActiveCliProvider()

  type ParsedEntry = { company: string; role: string; start_date: string; end_date: string | null; description: string; skills: string[] }
  let rawEntries: ParsedEntry[]
  let generationTime: number

  if (activeProvider === 'claude' || activeProvider === 'copilot') {
    // ── CLI provider: call directly from web server (no LLM Docker needed) ──
    const isCopilot = activeProvider === 'copilot'
    const label = isCopilot ? 'Copilot' : 'Claude'
    setCliProgress(sessionId, `Sending to ${label} CLI...`)

    const response = isCopilot
      ? await callCopilotCli(PARSE_RESUME_PROMPT + '\n\n' + resumeText, { sessionId })
      : await callClaudeCli(PARSE_RESUME_PROMPT + '\n\n' + resumeText, { sessionId })

    generationTime = response.durationMs / 1000

    // Extract JSON array from the response text
    // CLIs may wrap responses in ```json ... ``` markdown blocks — strip them first
    let responseText = response.text
    const codeBlockMatch = responseText.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) responseText = codeBlockMatch[1]

    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.log(`[parse-resume] No JSON array found in ${label} response:`, responseText.slice(0, 500))
      throw new Error(`${label} CLI did not return a JSON array. Response: ` + responseText.slice(0, 300))
    }
    try {
      rawEntries = JSON.parse(jsonMatch[0])
    } catch (e) {
      throw new Error(`Failed to parse JSON from ${label} CLI output: ${e}`)
    }
    setCliProgress(sessionId, `Parsed ${rawEntries.length} entries in ${generationTime.toFixed(1)}s via ${label}`)
    console.log(`[parse-resume] Parsed ${rawEntries.length} entries in ${generationTime.toFixed(1)}s via ${label}`)
  } else {
    // ── Local LLM: call the Python LLM service ──
    setCliProgress(sessionId, 'Sending to local LLM service...')
    const provider = await getConfigValue('active_provider')
    const modelId = await getConfigValue('active_model_id')
    const cliPath = await getConfigValue('claude_cli_path')
    const providerFields: Record<string, string> = {}
    if (provider === 'claude' && modelId) {
      providerFields.model_id = modelId.startsWith('claude/') ? modelId : `claude/${modelId}`
      if (cliPath) providerFields.cli_path = cliPath
    }

    const res = await fetch(`${LLM_URL}/parse-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_text: resumeText, ...providerFields }),
      signal: AbortSignal.timeout(180000),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { detail?: string }).detail || `LLM parse failed: HTTP ${res.status}`)
    }

    const result = await res.json() as { entries: ParsedEntry[]; generation_time_s: number }
    rawEntries = result.entries
    generationTime = result.generation_time_s
  }

  setCliProgress(sessionId, `Mapping ${rawEntries.length} entries...`)

  // Map to ExperienceEntry format with auto-detected categories
  const entries: ExperienceEntry[] = rawEntries.map((e) => ({
    category: inferCategory(e.company, e.role) as ExperienceCategory,
    company: e.company,
    role: e.role,
    startDate: e.start_date || null,
    endDate: e.end_date || null,
    description: e.description,
    skills: e.skills || [],
  }))

  clearCliProgress(sessionId)
  activeParseSessionId = null

  return { entries, generationTime }
})

/** Infer experience category from company/role fields. */
function inferCategory(company: string, role: string): string {
  const c = company.toLowerCase()
  const r = role.toLowerCase()
  if (c === 'publications' || r === 'author') return 'publication'
  if (/university|college|school|institute|akademie/i.test(c) || /b\.s\.|m\.s\.|ph\.d|bachelor|master|degree|diploma/i.test(r)) return 'education'
  if (r === 'project' || c === r) return 'project'
  if (c === 'sabbatical' || r === 'career break') return 'work'
  return 'work'
}
