import { resolve } from 'node:path'

type JsonFn = (data: unknown, status?: number) => Response

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')

export async function handleConfigRoutes(req: Request, url: URL, json: JsonFn): Promise<Response> {
  const path = url.pathname

  // Save Google API credentials (from setup wizard)
  if (req.method === 'POST' && path === '/api/config/google-credentials') {
    const body = await req.json() as { clientId: string; clientSecret: string; redirectUri?: string }

    // Set as environment variables for the current process
    process.env.GOOGLE_CLIENT_ID = body.clientId
    process.env.GOOGLE_CLIENT_SECRET = body.clientSecret
    if (body.redirectUri) {
      process.env.GOOGLE_REDIRECT_URI = body.redirectUri
    }

    // Persist to a config file so they survive restarts
    const configPath = resolve(dataDir, '.google-credentials.json')
    await Bun.write(configPath, JSON.stringify({
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      redirectUri: body.redirectUri || process.env.GOOGLE_REDIRECT_URI,
    }, null, 2))

    return json({ ok: true })
  }

  if (req.method === 'GET' && path === '/api/config/status') {
    return json({
      googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      dataDir,
    })
  }

  return json({ error: 'Not found' }, 404)
}
