import { chromium, type Browser, type BrowserContext } from 'playwright'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

// --- User-Agent Rotation ---

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:121.0) Gecko/20100101 Firefox/121.0',
]

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

// --- Viewport Diversity ---

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1280, height: 720 },
]

function getRandomViewport() {
  return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)]
}

// --- Proxy Rotation ---

interface ProxyConfig {
  server: string
  username?: string
  password?: string
}

function parseProxyList(): ProxyConfig[] {
  const raw = process.env.PROXY_LIST
  if (!raw) return []

  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        const url = new URL(entry)
        return {
          server: `${url.protocol}//${url.hostname}:${url.port}`,
          username: url.username || undefined,
          password: url.password || undefined,
        }
      } catch {
        // Treat as plain server address if not a valid URL
        return { server: entry }
      }
    })
}

const proxyList = parseProxyList()
let proxyIndex = 0

function getNextProxy(): ProxyConfig | undefined {
  if (proxyList.length === 0) return undefined
  const proxy = proxyList[proxyIndex % proxyList.length]
  proxyIndex++
  return proxy
}

if (proxyList.length > 0) {
  console.log(`Proxy rotation enabled: ${proxyList.length} proxies loaded`)
} else {
  console.log('No proxies configured (set PROXY_LIST env var to enable)')
}

// --- Generic browser singleton ---

let browser: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    const proxy = getNextProxy()
    browser = await chromium.launch({
      headless: true,
      proxy: proxy ? { server: proxy.server, username: proxy.username, password: proxy.password } : undefined,
    })
  }
  return browser
}

/**
 * Create an isolated browser context with anti-detection features:
 * - Random user-agent
 * - Random viewport size
 * - Random timezone and locale
 * - Proxy rotation (if PROXY_LIST is set)
 */
export async function createBrowserContext(): Promise<BrowserContext> {
  const b = await getBrowser()
  const viewport = getRandomViewport()
  const userAgent = getRandomUserAgent()

  return b.newContext({
    viewport,
    userAgent,
    locale: 'en-US',
    timezoneId: 'America/New_York',
  })
}

// --- LinkedIn persistent context ---
// LinkedIn uses a STABLE fingerprint (fixed UA, viewport, proxy) to avoid
// "logged in from a new device" emails. The persistent context already stores
// cookies/session data on disk — changing UA or proxy between restarts would
// make LinkedIn think it's a different browser/device.

const LINKEDIN_DATA_DIR = resolve(process.env.DATA_DIR || './data', 'linkedin-profile')
mkdirSync(LINKEDIN_DATA_DIR, { recursive: true })

const LINKEDIN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const LINKEDIN_VIEWPORT = { width: 1280, height: 900 }

// LinkedIn always uses the FIRST proxy (if any) so the IP is consistent.
const linkedInProxy = proxyList.length > 0 ? proxyList[0] : undefined

let linkedInContext: BrowserContext | null = null

export async function getLinkedInContext(): Promise<BrowserContext> {
  if (linkedInContext) {
    try {
      linkedInContext.pages()
      return linkedInContext
    } catch {
      console.log('LinkedIn: Persistent context died, recreating...')
      linkedInContext = null
    }
  }

  console.log('LinkedIn: Creating persistent context at', LINKEDIN_DATA_DIR)
  linkedInContext = await chromium.launchPersistentContext(LINKEDIN_DATA_DIR, {
    headless: true,
    viewport: LINKEDIN_VIEWPORT,
    userAgent: LINKEDIN_UA,
    proxy: linkedInProxy ? { server: linkedInProxy.server, username: linkedInProxy.username, password: linkedInProxy.password } : undefined,
    locale: 'en-US',
    timezoneId: 'America/New_York',
  })
  return linkedInContext
}

// --- Rate Limiting ---

export type BoardName = 'linkedin' | 'indeed' | 'glassdoor' | 'google'

interface RateLimitConfig {
  maxRequestsPerMin: number
  maxSessionDurationMs: number
  cooldownMs: number
}

const RATE_LIMITS: Record<BoardName, RateLimitConfig> = {
  linkedin: { maxRequestsPerMin: 3, maxSessionDurationMs: 15 * 60 * 1000, cooldownMs: 30 * 60 * 1000 },
  indeed: { maxRequestsPerMin: 7, maxSessionDurationMs: 10 * 60 * 1000, cooldownMs: 15 * 60 * 1000 },
  glassdoor: { maxRequestsPerMin: 4, maxSessionDurationMs: 10 * 60 * 1000, cooldownMs: 20 * 60 * 1000 },
  google: { maxRequestsPerMin: 12, maxSessionDurationMs: Infinity, cooldownMs: 0 },
}

interface BoardSession {
  requestTimestamps: number[]
  sessionStart: number | null
  cooldownUntil: number
}

const boardSessions: Record<BoardName, BoardSession> = {
  linkedin: { requestTimestamps: [], sessionStart: null, cooldownUntil: 0 },
  indeed: { requestTimestamps: [], sessionStart: null, cooldownUntil: 0 },
  glassdoor: { requestTimestamps: [], sessionStart: null, cooldownUntil: 0 },
  google: { requestTimestamps: [], sessionStart: null, cooldownUntil: 0 },
}

/**
 * Check if a request to a board is allowed under rate limits.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }.
 */
export function checkRateLimit(board: BoardName): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now()
  const config = RATE_LIMITS[board]
  const session = boardSessions[board]

  // Check cooldown
  if (now < session.cooldownUntil) {
    return { allowed: false, retryAfterMs: session.cooldownUntil - now }
  }

  // Check session duration
  if (session.sessionStart && now - session.sessionStart > config.maxSessionDurationMs) {
    // Session expired — enter cooldown
    session.cooldownUntil = now + config.cooldownMs
    session.sessionStart = null
    session.requestTimestamps = []
    return { allowed: false, retryAfterMs: config.cooldownMs }
  }

  // Check per-minute rate
  const oneMinAgo = now - 60_000
  session.requestTimestamps = session.requestTimestamps.filter((t) => t > oneMinAgo)

  if (session.requestTimestamps.length >= config.maxRequestsPerMin) {
    const oldestInWindow = session.requestTimestamps[0]
    return { allowed: false, retryAfterMs: oldestInWindow + 60_000 - now }
  }

  return { allowed: true }
}

/**
 * Record that a request was made to a board (call after checkRateLimit returns allowed).
 */
export function recordRequest(board: BoardName): void {
  const now = Date.now()
  const session = boardSessions[board]

  if (!session.sessionStart) {
    session.sessionStart = now
  }
  session.requestTimestamps.push(now)
}
