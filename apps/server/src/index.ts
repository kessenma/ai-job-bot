import { handleJobsRoutes } from './routes/jobs.ts'
import { handleSheetsRoutes } from './routes/sheets.ts'
import { handleGmailRoutes } from './routes/gmail.ts'
import { handleAuthRoutes } from './routes/auth.ts'
import { handleConfigRoutes } from './routes/config.ts'
import { handleLlmRoutes } from './routes/llm.ts'
import { handlePlaywrightRoutes } from './routes/playwright.ts'
import { ensureDb } from '@job-app-bot/db/init'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

// Restore persisted Google credentials if they exist
const credPath = resolve(dataDir, '.google-credentials.json')
if (existsSync(credPath)) {
  try {
    const creds = JSON.parse(readFileSync(credPath, 'utf-8'))
    if (creds.clientId) process.env.GOOGLE_CLIENT_ID = creds.clientId
    if (creds.clientSecret) process.env.GOOGLE_CLIENT_SECRET = creds.clientSecret
    if (creds.redirectUri) process.env.GOOGLE_REDIRECT_URI = creds.redirectUri
  } catch {
    // ignore corrupt config
  }
}

// Initialize database on startup
ensureDb()

const PORT = parseInt(process.env.PORT || '0', 10) // 0 = random available port

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

function handleCors() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // Handle CORS preflight
    if (req.method === 'OPTIONS') return handleCors()

    try {
      // Route to handlers
      if (path.startsWith('/api/jobs')) return await handleJobsRoutes(req, url, json)
      if (path.startsWith('/api/sheets')) return await handleSheetsRoutes(req, url, json)
      if (path.startsWith('/api/gmail')) return await handleGmailRoutes(req, url, json)
      if (path.startsWith('/api/auth')) return await handleAuthRoutes(req, url, json)
      if (path.startsWith('/api/config')) return await handleConfigRoutes(req, url, json)
      if (path.startsWith('/api/llm')) return await handleLlmRoutes(req, url, json)
      if (path.startsWith('/api/playwright')) return await handlePlaywrightRoutes(req, url, json)

      // Health check
      if (path === '/health') return json({ status: 'ok' })

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      console.error('Server error:', err)
      return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
    }
  },
})

// Write port to stdout so the RN app can read it
console.log(`Server listening on port ${server.port}`)

// Write port to a file for the RN app to discover
const portFilePath = `${process.env.DATA_DIR || '.'}/server-port`
await Bun.write(portFilePath, String(server.port))
