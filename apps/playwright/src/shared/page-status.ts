import type { Page, BrowserContext } from 'playwright'

export async function detectCaptcha(page: Page): Promise<boolean> {
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    '.g-recaptcha',
    '.h-captcha',
    '[data-sitekey]',
    '#captcha',
  ]
  for (const selector of captchaSelectors) {
    const el = await page.$(selector)
    if (el) return true
  }
  return false
}

export interface RawProbeResult {
  url: string
  status: 'loaded' | 'blocked' | 'expired' | 'error'
  httpStatus: number | null
  hasCaptcha: boolean
  title: string | null
  errorMessage: string | null
  probeTimeMs: number
}

export const EXPIRED_PATTERNS = [
  /position.*(?:filled|closed|expired|no longer)/i,
  /no longer accepting/i,
  /job.*(?:not found|unavailable|removed)/i,
  /this page (?:does not exist|cannot be found)/i,
]

export const BLOCKED_PATTERNS = [
  /access denied/i,
  /please verify/i,
  /checking your browser/i,
]

export async function probeUrl(context: BrowserContext, url: string): Promise<RawProbeResult> {
  const start = Date.now()
  const page = await context.newPage()
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })

    const httpStatus = response?.status() ?? null
    const title = await page.title().catch(() => null)

    if (httpStatus === 404 || httpStatus === 410) {
      return { url, status: 'expired', httpStatus, hasCaptcha: false, title, errorMessage: null, probeTimeMs: Date.now() - start }
    }

    if (httpStatus === 403 || httpStatus === 401) {
      return { url, status: 'blocked', httpStatus, hasCaptcha: false, title, errorMessage: null, probeTimeMs: Date.now() - start }
    }

    const bodyText = await page.textContent('body').catch(() => '') ?? ''

    for (const pattern of EXPIRED_PATTERNS) {
      if (pattern.test(bodyText)) {
        return { url, status: 'expired', httpStatus, hasCaptcha: false, title, errorMessage: null, probeTimeMs: Date.now() - start }
      }
    }

    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(bodyText)) {
        const hasCaptcha = await detectCaptcha(page)
        return { url, status: 'blocked', httpStatus, hasCaptcha, title, errorMessage: null, probeTimeMs: Date.now() - start }
      }
    }

    const hasCaptcha = await detectCaptcha(page)

    return { url, status: 'loaded', httpStatus, hasCaptcha, title, errorMessage: null, probeTimeMs: Date.now() - start }
  } catch (err) {
    return {
      url,
      status: 'error',
      httpStatus: null,
      hasCaptcha: false,
      title: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      probeTimeMs: Date.now() - start,
    }
  } finally {
    await page.close()
  }
}
