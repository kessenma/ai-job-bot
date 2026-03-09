import { google } from 'googleapis'
import { writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

type JsonFn = (data: unknown, status?: number) => Response

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const TOKEN_PATH = resolve(dataDir, '.gmail-token.json')

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback'

  if (!clientId || !clientSecret) {
    throw new Error('Google API credentials not configured. Complete the setup wizard first.')
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export async function handleAuthRoutes(req: Request, url: URL, json: JsonFn): Promise<Response> {
  const path = url.pathname

  if (req.method === 'GET' && path === '/api/auth/url') {
    const oauth2Client = getOAuth2Client()
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/spreadsheets.readonly',
      ],
    })
    return json({ url: authUrl })
  }

  if (req.method === 'POST' && path === '/api/auth/callback') {
    const body = await req.json() as { code: string }
    const oauth2Client = getOAuth2Client()
    const { tokens } = await oauth2Client.getToken(body.code)
    writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
    return json({ ok: true })
  }

  if (req.method === 'GET' && path === '/api/auth/status') {
    const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    const authenticated = existsSync(TOKEN_PATH)
    return json({ configured, authenticated })
  }

  if (req.method === 'POST' && path === '/api/auth/disconnect') {
    if (existsSync(TOKEN_PATH)) unlinkSync(TOKEN_PATH)
    return json({ ok: true })
  }

  return json({ error: 'Not found' }, 404)
}
