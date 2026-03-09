import { createServerFn } from '@tanstack/react-start'
import { readCoverLetterTexts, readResumeText, readDocumentTextsByName } from './uploads.server.ts'

const LLM_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8083'

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
    const res = await fetch(`${LLM_URL}/models/status`, { signal: AbortSignal.timeout(5000) })
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
  .inputValidator((data: { message: string; documentNames?: string[] }) => data)
  .handler(async ({ data }) => {
    const context = data.documentNames && data.documentNames.length > 0
      ? await readDocumentTextsByName(data.documentNames)
      : undefined

    console.log('[chatWithLlm] documentNames:', data.documentNames, 'context length:', context?.length ?? 0)

    const res = await fetch(`${LLM_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: data.message, context }),
      signal: AbortSignal.timeout(120000),
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
    }) => data,
  )
  .handler(async ({ data }) => {
    const samples = await readCoverLetterTexts()
    const resumeText = await readResumeText()

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
      }),
      signal: AbortSignal.timeout(120000), // 2 min for generation
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`)
    }

    const result = await res.json()
    return {
      coverLetter: (result as { cover_letter: string }).cover_letter,
      generationTime: (result as { generation_time_s: number }).generation_time_s,
    }
  })
