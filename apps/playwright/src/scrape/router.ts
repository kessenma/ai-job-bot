import { Hono } from 'hono'
import { getBrowser, createBrowserContext } from '../browser'
import { detectCaptcha, EXPIRED_PATTERNS, BLOCKED_PATTERNS, probeUrl } from '../shared/page-status'
import { dismissCookieConsent } from '../shared/cookie-consent'
import { findAndClickApply } from '../shared/apply-button'
import { takeScreenshot } from '../shared/click-overlay'
import { JOB_DESCRIPTION_SELECTORS, MIN_DESCRIPTION_LENGTH } from './selectors'
import { eventBus } from '../shared/event-bus'

// --- Cloudflare challenge detection & wait ---

const CF_CHALLENGE_SIGNALS = [
  'Performing security verification',
  'Checking your browser',
  'Checking if the site connection is secure',
  'Enable JavaScript and cookies to continue',
  'Just a moment',
]

async function waitForCloudflareChallenge(
  page: import('playwright').Page,
  log: (msg: string) => void,
  emitScreenshot: () => Promise<void>,
  maxWaitMs = 20000,
): Promise<boolean> {
  const bodyText = await page.textContent('body').catch(() => '') ?? ''
  const isChallenge = CF_CHALLENGE_SIGNALS.some((sig) => bodyText.includes(sig))

  if (!isChallenge) return false

  log('Cloudflare challenge detected — waiting for auto-resolve...')
  await emitScreenshot()

  const start = Date.now()

  // Wait for the challenge to resolve: either the body text changes or a CF element disappears
  try {
    await page.waitForFunction(
      (signals: string[]) => {
        const text = document.body?.innerText ?? ''
        return !signals.some((s) => text.includes(s))
      },
      CF_CHALLENGE_SIGNALS,
      { timeout: maxWaitMs },
    )
    log(`Cloudflare challenge resolved in ${((Date.now() - start) / 1000).toFixed(1)}s`)
    // Give the real page a moment to render
    await page.waitForTimeout(2000)
    await emitScreenshot()
    return true
  } catch {
    log(`Cloudflare challenge did not resolve within ${maxWaitMs / 1000}s`)
    await emitScreenshot()
    return false
  }
}

export const scrapeRouter = new Hono()

// --- Probe endpoint: visit URLs and check page status + captcha ---

scrapeRouter.post('/probe', async (c) => {
  const body = await c.req.json<{ urls: string[] }>()
  const { urls } = body

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return c.json({ error: 'urls array is required' }, 400)
  }
  if (urls.length > 50) {
    return c.json({ error: 'Maximum 50 URLs per batch' }, 400)
  }

  const start = Date.now()
  const b = await getBrowser()
  const context = await b.newContext()

  try {
    const results = []
    for (const url of urls) {
      results.push(await probeUrl(context, url))
    }
    return c.json({ results, totalTimeMs: Date.now() - start })
  } finally {
    await context.close()
  }
})

// --- Screenshot endpoint: visit a URL, take a screenshot, return base64 ---

scrapeRouter.post('/screenshot', async (c) => {
  const body = await c.req.json<{ url: string; sessionId?: string }>()
  const { url, sessionId } = body

  if (!url) {
    return c.json({ error: 'url is required' }, 400)
  }

  const emit = (type: string, data: Record<string, unknown> = {}) => {
    if (sessionId) eventBus.emit(sessionId, { type: type as 'log', timestamp: Date.now(), ...data })
  }

  const log = (message: string) => emit('log', { message })

  const start = Date.now()
  log(`Navigating to ${url}`)
  emit('progress', { stage: 'navigating', progress: 0.1 })

  const b = await getBrowser()
  const context = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })

    const httpStatus = response?.status() ?? null
    log(`Page loaded (HTTP ${httpStatus ?? 'unknown'})`)
    emit('progress', { stage: 'page_loaded', progress: 0.3 })

    const title = await page.title().catch(() => null)
    const bodyText = await page.textContent('body').catch(() => '') ?? ''

    let status: 'loaded' | 'blocked' | 'expired' | 'error' = 'loaded'

    if (httpStatus === 404 || httpStatus === 410) {
      status = 'expired'
    } else if (httpStatus === 403 || httpStatus === 401) {
      status = 'blocked'
    } else {
      for (const pattern of EXPIRED_PATTERNS) {
        if (pattern.test(bodyText)) { status = 'expired'; break }
      }
      if (status === 'loaded') {
        for (const pattern of BLOCKED_PATTERNS) {
          if (pattern.test(bodyText)) { status = 'blocked'; break }
        }
      }
    }

    if (status !== 'loaded') log(`Page status: ${status}`)

    const hasCaptcha = await detectCaptcha(page)
    if (hasCaptcha) log('CAPTCHA detected on page')

    // Dismiss cookie consent banners before screenshot
    const dismissedCookies = await dismissCookieConsent(page)
    if (dismissedCookies) log('Dismissed cookie consent banner')
    emit('progress', { stage: 'interacting', progress: 0.5 })

    // Try to find and click an "Apply" button (EN/DE)
    const applyResult = await findAndClickApply(page)
    if (applyResult.clicked) {
      log(`Clicked apply button: "${applyResult.buttonText}"`)
      emit('progress', { stage: 'clicked_apply', progress: 0.6 })
    }

    // If we navigated to an apply page, dismiss cookies again (new page may have its own banner)
    if (applyResult.clicked) {
      await dismissCookieConsent(page)
    }

    // Wait a bit for images/styles to load before screenshot
    log('Waiting for page to settle...')
    await page.waitForTimeout(1000)

    emit('progress', { stage: 'capturing', progress: 0.8 })
    log('Taking screenshot')

    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false })
    const screenshot = screenshotBuffer.toString('base64')

    // Send screenshot frame to SSE viewers
    emit('screenshot', { screenshot })

    // Get updated title/URL after any navigation
    const finalTitle = await page.title().catch(() => title)
    const finalUrl = page.url()

    const timeMs = Date.now() - start
    log(`Done in ${timeMs}ms`)
    emit('done', { message: `Screenshot captured in ${timeMs}ms` })
    if (sessionId) eventBus.cleanup(sessionId)

    return c.json({
      screenshot,
      title: finalTitle,
      status,
      hasCaptcha,
      httpStatus,
      timeMs,
      actions: {
        dismissedCookies,
        clickedApply: applyResult.clicked,
        applyButtonText: applyResult.buttonText,
        navigatedTo: applyResult.clicked ? finalUrl : null,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`Error: ${message}`)
    emit('error', { message })
    if (sessionId) eventBus.cleanup(sessionId)
    return c.json({ error: message }, 500)
  } finally {
    await context.close()
  }
})

// --- Scrape job description text from a URL ---

scrapeRouter.post('/scrape-description', async (c) => {
  const body = await c.req.json<{ url: string; sessionId?: string }>()
  const { url, sessionId } = body

  if (!url) {
    return c.json({ error: 'url is required' }, 400)
  }

  const emit = (type: string, data: Record<string, unknown> = {}) => {
    if (sessionId) eventBus.emit(sessionId, { type: type as 'log', timestamp: Date.now(), ...data })
  }
  const log = (message: string) => emit('log', { message })

  const start = Date.now()
  log(`Navigating to ${url}`)
  emit('progress', { stage: 'navigating', progress: 0.1 })

  // Use anti-detection browser context (random UA, viewport)
  const context = await createBrowserContext()
  const page = await context.newPage()

  const emitScreenshot = async () => {
    if (sessionId) {
      const ss = await takeScreenshot(page)
      emit('screenshot', { screenshot: ss })
    }
  }

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })

    let title = await page.title().catch(() => null)
    log(`Page loaded: ${title ?? url}`)
    emit('progress', { stage: 'page_loaded', progress: 0.25 })
    await emitScreenshot()

    // Handle Cloudflare / bot challenges
    const hadChallenge = await waitForCloudflareChallenge(page, log, emitScreenshot)
    if (hadChallenge) {
      // Re-read title after challenge resolves (page content changed)
      title = await page.title().catch(() => null)
      emit('progress', { stage: 'page_loaded', progress: 0.4 })
    }

    // Dismiss cookie consent banners
    await dismissCookieConsent(page)

    // Wait for dynamic content to render
    await page.waitForTimeout(1500)
    log('Extracting job description...')
    emit('progress', { stage: 'extracting', progress: 0.5 })

    await emitScreenshot()

    // Try selectors in priority order, using innerText to preserve line breaks
    let text: string | null = null
    let matchedSelector: string | null = null
    for (const selector of JOB_DESCRIPTION_SELECTORS) {
      try {
        const content = await page.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return null
          return (el as HTMLElement).innerText
        }, selector)
        if (content && content.trim().length >= MIN_DESCRIPTION_LENGTH) {
          text = content.trim()
          matchedSelector = selector
          break
        }
      } catch { /* selector didn't match */ }
    }

    // Fallback: check iframes for job content (Greenhouse, Lever, etc. embed via iframes)
    if (!text || text.length < MIN_DESCRIPTION_LENGTH) {
      log('Checking iframes for embedded job content...')
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue
        try {
          // Try selectors inside the iframe
          for (const selector of JOB_DESCRIPTION_SELECTORS) {
            const content = await frame.evaluate((sel) => {
              const el = document.querySelector(sel)
              if (!el) return null
              return (el as HTMLElement).innerText
            }, selector).catch(() => null)
            if (content && content.trim().length >= MIN_DESCRIPTION_LENGTH) {
              text = content.trim()
              matchedSelector = `iframe > ${selector}`
              break
            }
          }
          if (text && text.length >= MIN_DESCRIPTION_LENGTH) break

          // Try iframe body as last resort
          const iframeBody = await frame.evaluate(() => document.body?.innerText ?? null).catch(() => null)
          if (iframeBody && iframeBody.trim().length >= MIN_DESCRIPTION_LENGTH) {
            text = iframeBody.trim()
            matchedSelector = 'iframe > body'
            break
          }
        } catch { /* frame not accessible */ }
      }
    }

    // Final fallback: main page body
    if (!text || text.length < MIN_DESCRIPTION_LENGTH) {
      const bodyText = await page.evaluate(() => document.body?.innerText ?? null).catch(() => null)
      if (bodyText && bodyText.trim().length > (text?.length ?? 0)) {
        text = bodyText.trim()
        log('Using full page text (no specific job description element found)')
      } else if (!text) {
        log('Using full page text (no specific job description element found)')
      }
    }

    if (matchedSelector && text && text.length >= MIN_DESCRIPTION_LENGTH) {
      log(`Found job description via selector: ${matchedSelector} (${text.length} chars)`)
    }

    emit('progress', { stage: 'parsing', progress: 0.7 })

    // Clean up whitespace
    if (text) {
      text = text
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    // Extract structured metadata from visible page content
    log('Extracting job metadata...')
    emit('progress', { stage: 'metadata', progress: 0.85 })

    // Extract metadata from main page + iframes
    const extractMetadata = async (ctx: { evaluate: typeof page.evaluate }) => {
      return ctx.evaluate(() => {
        const getText = (selectors: string[]): string | null => {
          for (const sel of selectors) {
            const el = document.querySelector(sel)
            const t = el?.textContent?.trim()
            if (t && t.length > 1 && t.length < 200) return t
          }
          return null
        }

        const company = getText([
          '[data-testid="company-name"]',
          '.company-name', '.posting-categories .sort-by-team',
          '.job-company', '.employer-name',
          'a[data-tracking-control-name="public_jobs_topcard-org-name"]',
          '.topcard__org-name-link', '.sub-nav-cta__optional-url',
          '.jobs-unified-top-card__company-name',
          '[class*="CompanyName"]', '[class*="company-name"]',
          '.ashby-job-posting-brief-location ~ a',
          // Greenhouse embedded
          '.company-header__name', '[class*="company"][class*="header"]',
        ])

        const location = getText([
          '[data-testid="job-location"]',
          '.job-location', '.location',
          '.topcard__flavor--bullet',
          '.jobs-unified-top-card__bullet',
          '[class*="Location"]', '[class*="location"]',
          '.posting-categories .sort-by-location',
        ])

        const jobTitle = getText([
          '[data-testid="job-title"]',
          '.job-title', '.posting-headline h2',
          '.topcard__title', '.top-card-layout__title',
          '.jobs-unified-top-card__job-title',
          '[class*="JobTitle"]', '[class*="job-title"]',
          'h1',
        ])

        return { company, location, jobTitle }
      }).catch(() => ({ company: null, location: null, jobTitle: null }))
    }

    // Try main page first
    let metadata = await extractMetadata(page)

    // Try iframes if main page didn't yield results
    if (!metadata.company && !metadata.location && !metadata.jobTitle) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue
        const frameMeta = await extractMetadata(frame)
        if (frameMeta.company || frameMeta.location || frameMeta.jobTitle) {
          metadata = {
            company: metadata.company || frameMeta.company,
            location: metadata.location || frameMeta.location,
            jobTitle: metadata.jobTitle || frameMeta.jobTitle,
          }
          break
        }
      }
    }

    log(`Company: ${metadata.company ?? 'not found'}, Role: ${metadata.jobTitle ?? 'from title'}, Location: ${metadata.location ?? 'not found'}`)

    await emitScreenshot()

    const timeMs = Date.now() - start
    log(`Done in ${(timeMs / 1000).toFixed(1)}s — extracted ${text?.length ?? 0} chars`)
    emit('progress', { stage: 'done', progress: 1 })
    emit('done', { message: `Scraped in ${(timeMs / 1000).toFixed(1)}s` })

    if (sessionId) eventBus.cleanup(sessionId)

    return c.json({
      text: text ?? '',
      title,
      url: page.url(),
      company: metadata.company ?? null,
      jobTitle: metadata.jobTitle ?? null,
      location: metadata.location ?? null,
      timeMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit('error', { message })
    if (sessionId) eventBus.cleanup(sessionId)
    return c.json({ error: message }, 500)
  } finally {
    await context.close()
  }
})
