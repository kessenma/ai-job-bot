import { createServerFn } from '@tanstack/react-start'
import { readCoverLetterTexts, readResumeText, readDocumentTextsByName } from './uploads.server.ts'
import { listExperienceEntries } from './experience.server.ts'
import { getConfigValue } from './config.server.ts'
import { callClaudeCli, callCopilotCli, callCodexCli, getActiveCliProvider } from './claude-cli.server.ts'

const LLM_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8083'

/** Read active provider config from app_config DB. Returns model_id + cli_path if applicable. */
async function getActiveProviderConfig(): Promise<{ model_id?: string; cli_path?: string }> {
  const provider = await getConfigValue('active_provider')
  const modelId = await getConfigValue('active_model_id')
  const cliPath = await getConfigValue('claude_cli_path')

  if (provider === 'claude' && modelId) {
    return {
      model_id: modelId.startsWith('claude/') ? modelId : `claude/${modelId}`,
      cli_path: cliPath || undefined,
    }
  }

  return {}
}

export const getLlmStatus = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const res = await fetch(`${LLM_URL}/health`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { connected: false, status: 'error' as const }
    return { connected: true, ...(await res.json()) }
  } catch {
    return { connected: false, status: 'unreachable' as const }
  }
})

export const getLlmModels = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const cliPath = await getConfigValue('claude_cli_path')
    const url = cliPath
      ? `${LLM_URL}/models/status?cli_path=${encodeURIComponent(cliPath)}`
      : `${LLM_URL}/models/status`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { models: [], current_model: null }
    return res.json()
  } catch {
    return { models: [], current_model: null }
  }
})

export const switchLlmModel = createServerFn({ method: 'POST' })
  .inputValidator((data: { modelId: string }) => data)
  .handler(async ({ data }) => {
    const res = await fetch(`${LLM_URL}/switch-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: data.modelId }),
      signal: AbortSignal.timeout(300000), // 5 min for download + load
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`)
    }
    return res.json()
  })

export const deleteLlmModel = createServerFn({ method: 'POST' })
  .inputValidator((data: { modelId: string }) => data)
  .handler(async ({ data }) => {
    const res = await fetch(`${LLM_URL}/delete-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: data.modelId }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`)
    }
    return res.json()
  })

export const chatWithLlm = createServerFn({ method: 'POST' })
  .inputValidator((data: { message: string; documentNames?: string[]; modelId?: string }) => data)
  .handler(async ({ data }) => {
    const providerConfig = data.modelId ? {} : await getActiveProviderConfig()
    const context = data.documentNames && data.documentNames.length > 0
      ? await readDocumentTextsByName(data.documentNames)
      : undefined

    console.log('[chatWithLlm] documentNames:', data.documentNames, 'context length:', context?.length ?? 0)

    const res = await fetch(`${LLM_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: data.message,
        context,
        model_id: data.modelId || providerConfig.model_id,
        cli_path: providerConfig.cli_path,
      }),
      signal: AbortSignal.timeout(180000), // 3 min for CLI
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`)
    }
    const result = await res.json()
    return {
      response: (result as { response: string }).response,
      generationTime: (result as { generation_time_s: number }).generation_time_s,
    }
  })

export const embedDocumentText = createServerFn({ method: 'POST' })
  .inputValidator((data: { text: string }) => data)
  .handler(async ({ data }) => {
    const res = await fetch(`${LLM_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: data.text }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`Embed failed: HTTP ${res.status}`)
    return res.json() as Promise<{ embedding: number[]; model: string; dimensions: number }>
  })

export const generateCoverLetter = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      company: string
      role: string
      jobDescription?: string
      location?: string
      candidateName: string
      style?: 'classic' | 'modern'
      modelId?: string
      sampleNames?: string[]
    }) => data,
  )
  .handler(async ({ data }) => {
    const [samples, resumeText, experienceEntries] = await Promise.all([
      readCoverLetterTexts(data.sampleNames),
      readResumeText(),
      listExperienceEntries(),
    ])

    const styleGuide = (data.style || 'classic') === 'modern'
      ? 'Write a modern cover letter: single concise paragraph, confident conversational opener (no "Dear Hiring Manager"), focus on impact and mutual fit.'
      : 'Write a classic cover letter: 3-4 formal paragraphs, professional business tone, ATS-optimized.'

    const experienceBlock = experienceEntries.map((e) => {
      const dates = `${e.startDate || ''} - ${e.endDate ?? 'Present'}`
      const skills = Array.isArray(e.skills) ? e.skills.join(', ') : ''
      return `${e.company} — ${e.role} (${dates})\n${e.description}${skills ? `\nSkills: ${skills}` : ''}`
    }).join('\n\n')

    // Build the prompt
    const promptParts: string[] = [styleGuide]
    if (samples.length > 0) {
      promptParts.push(`\n\n--- COVER LETTER SAMPLES (match this writing style${samples.length > 1 ? ', prioritize the first as root template' : ''}) ---`)
      samples.forEach((s, i) => promptParts.push(`\n[Sample ${i + 1}]\n${s}`))
    }
    if (resumeText) {
      promptParts.push(`\n\n--- RESUME ---\n${resumeText}`)
    }
    if (experienceBlock) {
      promptParts.push(`\n\n--- EXPERIENCE ---\n${experienceBlock}`)
    }
    promptParts.push(`\n\n--- JOB DETAILS ---`)
    promptParts.push(`Company: ${data.company}`)
    promptParts.push(`Role: ${data.role}`)
    if (data.location) promptParts.push(`Location: ${data.location}`)
    if (data.jobDescription) promptParts.push(`\nJob Description:\n${data.jobDescription}`)
    promptParts.push(`\n\nWrite ONLY the cover letter text. No preamble, no subject line, no sign-off instructions.`)

    const fullPrompt = promptParts.join('\n')

    // Helper: generate via CLI
    const generateViaCli = async (provider: 'claude' | 'copilot' | 'codex') => {
      const startTime = Date.now()
      const callCli = provider === 'copilot' ? callCopilotCli : provider === 'codex' ? callCodexCli : callClaudeCli
      const response = await callCli(fullPrompt)
      const labels = { claude: 'Claude CLI', copilot: 'GitHub Copilot', codex: 'Codex CLI' }
      return {
        coverLetter: response.text,
        generationTime: (Date.now() - startTime) / 1000,
        modelUsed: labels[provider],
      }
    }

    // Helper: generate via local LLM service
    const generateViaLlmService = async () => {
      const providerConfig = data.modelId ? {} : await getActiveProviderConfig()
      const res = await fetch(`${LLM_URL}/generate-cover-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: data.company,
          role: data.role,
          job_description: data.jobDescription || '',
          location: data.location || '',
          candidate_name: data.candidateName,
          cover_letter_samples: samples,
          resume_text: resumeText,
          experience_entries: experienceEntries.map((e) => ({
            company: e.company,
            role: e.role,
            dates: `${e.startDate || ''} - ${e.endDate ?? 'Present'}`,
            description: e.description,
            skills: e.skills,
          })),
          style: data.style || 'classic',
          model_id: data.modelId || providerConfig.model_id,
          cli_path: providerConfig.cli_path,
        }),
        signal: AbortSignal.timeout(180000),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`)
      }
      const result = await res.json()
      return {
        coverLetter: (result as { cover_letter: string }).cover_letter,
        generationTime: (result as { generation_time_s: number }).generation_time_s,
        modelUsed: (result as { model_info: { model_name: string } }).model_info?.model_name,
      }
    }

    // ── Route to the active provider ──
    const activeProvider = await getActiveCliProvider()

    if (activeProvider === 'claude' || activeProvider === 'copilot' || activeProvider === 'codex') {
      return generateViaCli(activeProvider)
    }

    // Helper: find any available CLI provider for fallback
    const findFallbackCli = async (): Promise<'claude' | 'copilot' | 'codex' | null> => {
      const checks: Array<{ provider: 'claude' | 'copilot' | 'codex'; pathKey: string; authKey: string }> = [
        { provider: 'claude', pathKey: 'claude_cli_path', authKey: 'claude_cli_authenticated' },
        { provider: 'copilot', pathKey: 'gh_cli_path', authKey: 'gh_cli_authenticated' },
        { provider: 'codex', pathKey: 'codex_cli_path', authKey: 'codex_cli_authenticated' },
      ]
      for (const { provider, pathKey, authKey } of checks) {
        const path = await getConfigValue(pathKey)
        const auth = await getConfigValue(authKey)
        if (path && auth === 'true') return provider
      }
      return null
    }

    if (activeProvider === 'local') {
      // Try local LLM service first; if unreachable, fall back to any available CLI
      try {
        return await generateViaLlmService()
      } catch (llmError) {
        const fallback = await findFallbackCli()
        if (fallback) {
          console.log(`[generate-cover-letter] LLM service unavailable, falling back to ${fallback} CLI`)
          return generateViaCli(fallback)
        }
        throw llmError
      }
    }

    // No explicit provider set — try LLM service, fall back to CLI
    try {
      return await generateViaLlmService()
    } catch {
      const fallback = await findFallbackCli()
      if (fallback) {
        console.log(`[generate-cover-letter] LLM service unavailable, falling back to ${fallback} CLI`)
        return generateViaCli(fallback)
      }
      throw new Error('No LLM provider available. Start the LLM service or configure a CLI provider in Settings.')
    }
  })

export const generateResume = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      company: string
      role: string
      jobDescription?: string
      experienceEntries: { company: string; role: string; dates: string; description: string; skills: string[] }[]
      candidateName: string
      existingResumeText?: string
      modelId?: string
    }) => data,
  )
  .handler(async ({ data }) => {
    const providerConfig = data.modelId ? {} : await getActiveProviderConfig()
    const resumeText = data.existingResumeText || (await readResumeText())

    const res = await fetch(`${LLM_URL}/generate-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: data.company,
        role: data.role,
        job_description: data.jobDescription || '',
        experience_entries: data.experienceEntries,
        candidate_name: data.candidateName,
        existing_resume_text: resumeText,
        model_id: data.modelId || providerConfig.model_id,
        cli_path: providerConfig.cli_path,
      }),
      signal: AbortSignal.timeout(180000), // 3 min for resume generation
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`)
    }

    const result = await res.json()
    return {
      resumeText: (result as { resume_text: string }).resume_text,
      generationTime: (result as { generation_time_s: number }).generation_time_s,
    }
  })

// --- Answer Form Fields ---

export interface FormFieldSuggestion {
  label: string
  suggestedValue: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

export const answerFormFields = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    formFields: { label: string; type: string; required: boolean; options?: string[] }[]
    company?: string
    role?: string
    jobDescription?: string
  }) => data)
  .handler(async ({ data }): Promise<{ answers: FormFieldSuggestion[]; generationTime: number }> => {
    const { db, schema } = await import('@job-app-bot/db')

    // Load candidate profile
    const profiles = await db.select().from(schema.applyProfile).limit(1)
    const profile = profiles[0]
    const candidateProfile: Record<string, string> = {}
    if (profile) {
      for (const [key, val] of Object.entries(profile)) {
        if (val && typeof val === 'string' && key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
          candidateProfile[key] = val
        }
      }
    }

    // Load experience entries
    const entries = await listExperienceEntries()
    const experienceEntries = entries.map((e) => ({
      company: e.company,
      role: e.role,
      dates: [e.startDate, e.endDate].filter(Boolean).join(' - '),
      description: e.description,
      skills: typeof e.skills === 'string' ? JSON.parse(e.skills) : (e.skills || []),
    }))

    const providerConfig = await getActiveProviderConfig()

    const res = await fetch(`${LLM_URL}/answer-form-fields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form_fields: data.formFields.map((f) => ({
          label: f.label,
          type: f.type,
          required: f.required,
          options: f.options || [],
        })),
        candidate_profile: candidateProfile,
        experience_entries: experienceEntries,
        company: data.company || '',
        role: data.role || '',
        job_description: data.jobDescription || '',
        ...providerConfig,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`)
    }

    const result = (await res.json()) as {
      answers: { label: string; suggested_value: string; confidence: string; reasoning: string }[]
      generation_time_s: number
    }

    return {
      answers: result.answers.map((a) => ({
        label: a.label,
        suggestedValue: a.suggested_value,
        confidence: a.confidence as 'high' | 'medium' | 'low',
        reasoning: a.reasoning,
      })),
      generationTime: result.generation_time_s,
    }
  })
