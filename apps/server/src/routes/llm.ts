type JsonFn = (data: unknown, status?: number) => Response

const LLM_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8083'

export async function handleLlmRoutes(req: Request, url: URL, json: JsonFn): Promise<Response> {
  const path = url.pathname

  // GET /api/llm/health
  if (req.method === 'GET' && path === '/api/llm/health') {
    try {
      const res = await fetch(`${LLM_URL}/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return json({ connected: false, status: 'error' })
      const data = await res.json()
      return json({ connected: true, ...data })
    } catch {
      return json({ connected: false, status: 'unreachable' })
    }
  }

  // GET /api/llm/models or /api/llm/models/status — returns models with download progress
  if (req.method === 'GET' && (path === '/api/llm/models' || path === '/api/llm/models/status')) {
    try {
      const res = await fetch(`${LLM_URL}/models/status`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return json({ error: `LLM service error: ${res.status}` }, res.status)
      return json(await res.json())
    } catch {
      return json({ models: [], current_model: null })
    }
  }

  // GET /api/llm/model-info
  if (req.method === 'GET' && path === '/api/llm/model-info') {
    const res = await fetch(`${LLM_URL}/model-info`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return json({ error: `LLM service error: ${res.status}` }, res.status)
    return json(await res.json())
  }

  // POST /api/llm/switch-model
  if (req.method === 'POST' && path === '/api/llm/switch-model') {
    const body = await req.json() as { modelId: string }
    const res = await fetch(`${LLM_URL}/switch-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: body.modelId }),
      signal: AbortSignal.timeout(300000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return json({ error: (err as { detail?: string }).detail || `HTTP ${res.status}` }, res.status)
    }
    return json(await res.json())
  }

  // POST /api/llm/delete-model
  if (req.method === 'POST' && path === '/api/llm/delete-model') {
    const body = await req.json() as { modelId: string }
    const res = await fetch(`${LLM_URL}/delete-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: body.modelId }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return json({ error: (err as { detail?: string }).detail || `HTTP ${res.status}` }, res.status)
    }
    return json(await res.json())
  }

  // POST /api/llm/generate-cover-letter
  if (req.method === 'POST' && path === '/api/llm/generate-cover-letter') {
    const body = await req.json()
    const res = await fetch(`${LLM_URL}/generate-cover-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return json({ error: (err as { detail?: string }).detail || `HTTP ${res.status}` }, res.status)
    }
    return json(await res.json())
  }

  return json({ error: 'Not found' }, 404)
}
