import { api } from './client'

interface LlmHealthResponse {
  connected: boolean
  status: string
  model_loaded?: boolean
  active_model?: string | null
  memory_usage?: Record<string, number>
}

export interface ModelStatusInfo {
  id: string
  name: string
  size_gb: number
  downloaded: boolean
  active: boolean
  status: 'idle' | 'downloading' | 'loading' | 'ready' | 'error'
  download_progress: number // 0-100
  current_step: string
  error?: string | null
}

interface ModelsStatusResponse {
  models: ModelStatusInfo[]
  current_model: string | null
}

interface SwitchModelResponse {
  ok: boolean
  model: string
  status: 'downloading' | 'loading' | 'ready'
}

interface CoverLetterRequest {
  company: string
  role: string
  job_description?: string
  location?: string
  candidate_name: string
  cover_letter_samples?: string[]
  resume_text?: string
  temperature?: number
  max_length?: number
}

interface CoverLetterResponse {
  cover_letter: string
  model_info: Record<string, unknown>
  usage: Record<string, number>
  generation_time_s: number
}

export async function getLlmHealth(): Promise<LlmHealthResponse> {
  return api('/api/llm/health')
}

export async function getLlmModels(): Promise<ModelsStatusResponse> {
  return api('/api/llm/models/status')
}

export async function switchLlmModel(modelId: string): Promise<SwitchModelResponse> {
  return api('/api/llm/switch-model', {
    method: 'POST',
    body: JSON.stringify({ modelId }),
  })
}

export async function deleteLlmModel(modelId: string): Promise<{ ok: boolean; model_id: string; message: string }> {
  return api('/api/llm/delete-model', {
    method: 'POST',
    body: JSON.stringify({ modelId }),
  })
}

export async function generateCoverLetter(req: CoverLetterRequest): Promise<CoverLetterResponse> {
  return api('/api/llm/generate-cover-letter', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}
