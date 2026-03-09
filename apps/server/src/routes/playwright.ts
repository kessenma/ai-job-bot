import { classifyATS } from '@job-app-bot/shared/ats-classifier'

type JsonFn = (data: unknown, status?: number) => Response

const PLAYWRIGHT_URL = process.env.PLAYWRIGHT_SERVICE_URL || 'http://localhost:8084'

export async function handlePlaywrightRoutes(req: Request, url: URL, json: JsonFn): Promise<Response> {
  const path = url.pathname

  // GET /api/playwright/health
  if (req.method === 'GET' && path === '/api/playwright/health') {
    try {
      const res = await fetch(`${PLAYWRIGHT_URL}/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return json({ connected: false, status: 'error' })
      const data = await res.json()
      return json({ connected: true, ...data })
    } catch {
      return json({ connected: false, status: 'unreachable' })
    }
  }

  // POST /api/playwright/probe
  if (req.method === 'POST' && path === '/api/playwright/probe') {
    const body = await req.json()
    const res = await fetch(`${PLAYWRIGHT_URL}/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return json({ error: (err as { error?: string }).error || `HTTP ${res.status}` }, res.status)
    }
    const raw = (await res.json()) as { results: any[]; totalTimeMs: number }
    const results = raw.results.map((r: any) => ({
      ...r,
      atsPlatform: classifyATS(r.url),
    }))
    return json({ results, totalTimeMs: raw.totalTimeMs })
  }

  return json({ error: 'Not found' }, 404)
}
