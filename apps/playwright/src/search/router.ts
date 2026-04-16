import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { Page } from 'playwright'
import { mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { getLinkedInContext, checkRateLimit, recordRequest } from '../browser'
import {
  linkedInLastLoginAt, setLinkedInLastLoginAt,
  isLoginRecent, isLinkedInLoggedIn, linkedInLogin,
  isOnVerificationPage, ensureLinkedInLoggedIn,
} from '../shared/linkedin-auth'
import { humanDelay, humanScroll, waitForFullLoad } from '../shared/humanize'
import {
  type LinkedInWorkType,
  type LinkedInDatePosted,
  LINKEDIN_WORK_TYPE_TO_CODE,
  LINKEDIN_DATE_POSTED_TO_CODE,
  parseLinkedInResultsCount,
  extractRecruiterContacts,
  inferWorkType,
  cleanLocation,
  detectSponsorship,
  detectLanguage,
  type DetectedLanguage,
} from './linkedin-helpers'
import { eventBus, type SearchEvent } from '../shared/event-bus'
import { highlightAndScreenshot, takeScreenshot, clearOverlay } from '../shared/click-overlay'

export const searchRouter = new Hono()

const DATA_DIR = process.env.DATA_DIR || resolve(process.cwd(), 'data')
const RECORDINGS_DIR = resolve(DATA_DIR, 'recordings')
const MAX_RECORDINGS = 10

// ─── SSE stream endpoint ────────────────────────────────────────────────────

searchRouter.get('/linkedin-search/stream/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')

  return streamSSE(c, async (stream) => {
    let done = false

    const unsub = eventBus.subscribe(sessionId, async (event) => {
      try {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event), id: String(event.timestamp) })
      } catch { /* stream closed */ }
      if (event.type === 'done' || event.type === 'error') done = true
    })

    // Keep connection alive until search completes or client disconnects
    while (!done && !c.req.raw.signal.aborted) {
      await stream.sleep(500)
    }

    unsub()
  })
})

// ─── Recording serving endpoints ────────────────────────────────────────────

searchRouter.get('/recordings/:searchId', (c) => {
  const searchId = c.req.param('searchId')
  const metaPath = resolve(RECORDINGS_DIR, searchId, 'meta.json')
  if (!existsSync(metaPath)) return c.json({ error: 'Recording not found' }, 404)
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
  return c.json(meta)
})

searchRouter.get('/recordings/:searchId/:frame', (c) => {
  const { searchId, frame } = c.req.param()
  const framePath = resolve(RECORDINGS_DIR, searchId, frame)
  if (!existsSync(framePath)) return c.json({ error: 'Frame not found' }, 404)
  const buf = readFileSync(framePath)
  return new Response(buf, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } })
})

// ─── Helpers for recording persistence ───────────────────────────────────────

function saveRecording(searchId: string, frames: { data: string; timestamp: number }[], logs: string[]) {
  try {
    const dir = resolve(RECORDINGS_DIR, searchId)
    mkdirSync(dir, { recursive: true })

    const frameMeta: { file: string; timestamp: number }[] = []
    for (let i = 0; i < frames.length; i++) {
      const filename = `${String(i + 1).padStart(3, '0')}.jpg`
      writeFileSync(resolve(dir, filename), Buffer.from(frames[i].data, 'base64'))
      frameMeta.push({ file: filename, timestamp: frames[i].timestamp })
    }

    writeFileSync(resolve(dir, 'meta.json'), JSON.stringify({ searchId, frames: frameMeta, logs, savedAt: Date.now() }))
    cleanupOldRecordings()
  } catch (err) {
    console.error('Failed to save recording:', err)
  }
}

function cleanupOldRecordings() {
  try {
    if (!existsSync(RECORDINGS_DIR)) return
    const dirs = readdirSync(RECORDINGS_DIR)
      .map((name) => ({ name, path: resolve(RECORDINGS_DIR, name) }))
      .filter((d) => { try { return statSync(d.path).isDirectory() } catch { return false } })
      .sort((a, b) => {
        try {
          const metaA = JSON.parse(readFileSync(resolve(a.path, 'meta.json'), 'utf-8'))
          const metaB = JSON.parse(readFileSync(resolve(b.path, 'meta.json'), 'utf-8'))
          return (metaB.savedAt || 0) - (metaA.savedAt || 0)
        } catch { return 0 }
      })

    // Keep only the latest MAX_RECORDINGS
    for (const dir of dirs.slice(MAX_RECORDINGS)) {
      rmSync(dir.path, { recursive: true, force: true })
    }
  } catch (err) {
    console.error('Recording cleanup error:', err)
  }
}

// ─── Dismiss any LinkedIn modal overlay ──────────────────────────────────────

async function dismissAnyModal(page: Page, log?: (msg: string) => void): Promise<boolean> {
  try {
    const modal = await page.$('.artdeco-modal-overlay--is-top-layer, [role="dialog"].artdeco-modal, [data-test-modal-container]')
    if (!modal) return false

    const modalText = await modal.evaluate((el) => el.textContent || '').catch(() => '')
    const snippet = modalText.replace(/\s+/g, ' ').trim().slice(0, 80)

    // Strategy 1: close/dismiss button (X icon) — works for most modals
    const closeBtn = await modal.$([
      'button[aria-label="Dismiss"]',
      'button[aria-label="Close"]',
      'button[data-test-modal-close-btn]',
      'button.artdeco-modal__dismiss',
    ].join(', '))
    if (closeBtn) {
      await closeBtn.click()
      log?.(`LinkedIn: Dismissed modal via close button ("${snippet}…")`)
      await new Promise((r) => setTimeout(r, 500))
      return true
    }

    // Strategy 2: "Continue", "Got it", "Skip", "No thanks" — common action buttons
    const buttons = await modal.$$('button')
    for (const btn of buttons) {
      const text = (await btn.textContent())?.trim().toLowerCase() || ''
      if (/^(continue|got it|skip|no thanks|not now|close|ok)$/i.test(text.replace(/[^a-z ]/gi, '').trim())) {
        await btn.click()
        log?.(`LinkedIn: Dismissed modal via "${text}" button ("${snippet}…")`)
        await new Promise((r) => setTimeout(r, 500))
        return true
      }
    }

    // Strategy 3: click the overlay backdrop itself to close
    const overlay = await page.$('.artdeco-modal-overlay--is-top-layer')
    if (overlay) {
      // Click the top-left corner of the overlay (outside the modal content)
      await overlay.click({ position: { x: 5, y: 5 }, force: true })
      log?.(`LinkedIn: Dismissed modal via overlay click ("${snippet}…")`)
      await new Promise((r) => setTimeout(r, 500))
      return true
    }

    // Strategy 4: press Escape as last resort
    await page.keyboard.press('Escape')
    log?.(`LinkedIn: Dismissed modal via Escape key ("${snippet}…")`)
    await new Promise((r) => setTimeout(r, 500))
    return true
  } catch {
    // Modal dismissal failed — try Escape as absolute last resort
    try { await page.keyboard.press('Escape') } catch { /* noop */ }
    return false
  }
}

// ─── Main search endpoint ────────────────────────────────────────────────────

searchRouter.post('/linkedin-search', async (c) => {
  const body = await c.req.json<{
    keywords: string
    location: string
    skills: string[]
    maxResults?: number
    mode?: 'scan' | 'find_matches'
    targetMatches?: number
    minSkillMatch?: number
    workTypes?: LinkedInWorkType[]
    datePosted?: LinkedInDatePosted
    linkedinEmail?: string
    linkedinPassword?: string
    sessionId?: string
    knownJobs?: { company: string; role: string }[]
    knownUrls?: string[]
    excludeGerman?: boolean
    searchLimit?: number  // max cards to scan (0 = exhaust all loaded)
  }>()
  // Rate limit check — prevent hammering LinkedIn
  const rateLimit = checkRateLimit('linkedin')
  if (!rateLimit.allowed) {
    return c.json({
      status: 'rate_limited',
      message: `LinkedIn rate limit reached. Retry in ${Math.ceil(rateLimit.retryAfterMs / 1000)}s.`,
      retryAfterMs: rateLimit.retryAfterMs,
    }, 429)
  }
  recordRequest('linkedin')

  const linkedInEmail = body.linkedinEmail || process.env.LINKEDIN_EMAIL
  const linkedInPassword = body.linkedinPassword || process.env.LINKEDIN_PASSWORD

  if (!linkedInEmail || !linkedInPassword) {
    return c.json({
      status: 'auth_error',
      message: 'LinkedIn credentials are not configured.',
    }, 400)
  }
  const { keywords, location, skills, maxResults: requestedMax } = body
  const mode = body.mode || 'scan'
  const targetMatches = body.targetMatches || requestedMax || 5
  const minSkillMatch = body.minSkillMatch || 1
  const workTypes = (body.workTypes || []).filter((value): value is LinkedInWorkType => (
    value === 'remote' || value === 'hybrid' || value === 'onsite'
  ))
  const workTypeCodes = [...new Set(workTypes.map((workType) => LINKEDIN_WORK_TYPE_TO_CODE[workType]))]
  const validDatePosted: LinkedInDatePosted[] = ['any', 'past_month', 'past_week', 'past_24h']
  const datePosted: LinkedInDatePosted = validDatePosted.includes(body.datePosted as LinkedInDatePosted) ? body.datePosted as LinkedInDatePosted : 'past_24h'
  const datePostedCode = LINKEDIN_DATE_POSTED_TO_CODE[datePosted]
  const isFindMode = mode === 'find_matches' && skills.length > 0

  // Build dedup sets from known jobs passed by the web app
  const knownUrlSet = new Set((body.knownUrls || []).map((u) => u.toLowerCase()))
  const knownJobSet = new Set(
    (body.knownJobs || []).map((j) => `${j.company.toLowerCase().trim()}|||${j.role.toLowerCase().trim()}`),
  )
  const isKnownJob = (company: string, role: string, url: string): boolean => {
    if (knownUrlSet.has(url.toLowerCase())) return true
    return knownJobSet.has(`${company.toLowerCase().trim()}|||${role.toLowerCase().trim()}`)
  }
  const excludeGerman = body.excludeGerman ?? false
  const searchLimit = body.searchLimit ?? 0  // 0 = exhaust all
  let skippedDuplicates = 0
  let skippedGerman = 0

  if (!keywords?.trim()) {
    return c.json({ status: 'error', message: 'keywords is required' }, 400)
  }

  // Streaming support: if sessionId is provided, emit events via event bus
  const sessionId = body.sessionId || null
  const recordedFrames: { data: string; timestamp: number }[] = []

  let page: Page | null = null
  const logs: string[] = []
  const log = (msg: string) => {
    logs.push(msg)
    console.log(msg)
    if (sessionId) {
      eventBus.emit(sessionId, { type: 'log', message: msg, timestamp: Date.now() })
    }
  }

  const emitProgress = (stage: string, progress: number) => {
    if (sessionId) {
      eventBus.emit(sessionId, { type: 'progress', stage, progress, timestamp: Date.now() })
    }
  }

  const emitScreenshot = async (p: Page, label?: string) => {
    if (!sessionId) return
    try {
      const ss = await takeScreenshot(p)
      const frame = { data: ss, timestamp: Date.now() }
      recordedFrames.push(frame)
      eventBus.emit(sessionId, { type: 'screenshot', screenshot: ss, label, timestamp: frame.timestamp })
    } catch { /* screenshot failed */ }
  }

  // Background screenshot loop: captures every ~1.5s for smooth video-like feed
  let screenshotInterval: ReturnType<typeof setInterval> | null = null
  const startScreenshotLoop = (p: Page) => {
    if (!sessionId) return
    screenshotInterval = setInterval(async () => {
      try {
        const ss = await takeScreenshot(p)
        const frame = { data: ss, timestamp: Date.now() }
        recordedFrames.push(frame)
        eventBus.emit(sessionId, { type: 'screenshot', screenshot: ss, timestamp: frame.timestamp })
      } catch { /* page might be navigating */ }
    }, 1500)
  }
  const stopScreenshotLoop = () => {
    if (screenshotInterval) { clearInterval(screenshotInterval); screenshotInterval = null }
  }

  try {
    const ctx = await getLinkedInContext()
    page = await ctx.newPage()

    emitProgress('logging_in', 0.05)

    // Login orchestration
    const loginError = await ensureLinkedInLoggedIn(page, linkedInEmail, linkedInPassword, log)
    if (loginError) {
      if (sessionId) eventBus.emit(sessionId, { type: 'error', message: loginError.message, timestamp: Date.now() })
      return c.json({ status: loginError.status, message: loginError.message, logs }, loginError.httpStatus)
    }

    emitProgress('logged_in', 0.15)
    await emitScreenshot(page, 'Login successful')

    // Navigate to job search
    const searchParams = new URLSearchParams({
      keywords: keywords.trim(),
      location: (location || '').trim(),
      sortBy: 'DD',
    })
    if (datePostedCode) {
      searchParams.set('f_TPR', datePostedCode)
      log('LinkedIn: Applying date filter: ' + datePosted + ' (' + datePostedCode + ')')
    } else {
      log('LinkedIn: No date filter (any time)')
    }
    if (workTypeCodes.length > 0) {
      searchParams.set('f_WT', workTypeCodes.join(','))
      log('LinkedIn: Applying work type filter(s): ' + workTypes.join(', '))
    }
    const searchUrl = `https://www.linkedin.com/jobs/search/?${searchParams.toString()}`
    log('LinkedIn: Navigating to search URL: ' + searchUrl)
    emitProgress('navigating', 0.2)
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForFullLoad(page)

    // Start the background screenshot loop now that we're on the search page
    startScreenshotLoop(page)

    // Check if we got redirected to login or verification page
    const postNavUrl = page.url()
    const postNavTitle = await page.title()
    log('LinkedIn: After navigation - URL: ' + postNavUrl + ' Title: ' + postNavTitle)

    // Check if we're on the public (unauthenticated) version of the search page
    const isAuthenticatedPage = await page.evaluate(() => {
      return !!document.querySelector('#global-nav, .global-nav, [data-test-global-nav]')
    }).catch(() => false)
    log('LinkedIn: Authenticated page: ' + isAuthenticatedPage)

    if (!isAuthenticatedPage && !postNavUrl.includes('/login') && !postNavUrl.includes('/authwall')) {
      log('LinkedIn: On public/unauthenticated page, need to login...')
      setLinkedInLastLoginAt(0)
      const loginResult = await linkedInLogin(page, linkedInEmail, linkedInPassword)
      if (!loginResult.ok) {
        log('LinkedIn: Login failed - ' + loginResult.reason + '. Falling back to public page results.')
      } else {
        log('LinkedIn: Login successful, retrying search...')
        setLinkedInLastLoginAt(Date.now())
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await waitForFullLoad(page)
      }
    } else if (postNavUrl.includes('/login') || postNavUrl.includes('/authwall')) {
      log('LinkedIn: Session expired, redirected to login. Attempting re-login...')
      setLinkedInLastLoginAt(0)
      const loginResult = await linkedInLogin(page, linkedInEmail, linkedInPassword)
      if (!loginResult.ok) {
        log('LinkedIn: Re-login failed - ' + loginResult.reason)
        const statusMap = { credentials: 'auth_error', captcha: 'captcha_blocked', verification_pending: 'verification_pending', error: 'error' } as const
        if (sessionId) eventBus.emit(sessionId, { type: 'error', message: loginResult.message, timestamp: Date.now() })
        return c.json({ status: statusMap[loginResult.reason], message: loginResult.message, logs }, loginResult.reason === 'credentials' ? 401 : 403)
      }
      log('LinkedIn: Re-login successful, retrying search...')
      setLinkedInLastLoginAt(Date.now())
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await waitForFullLoad(page)
    }

    if (isOnVerificationPage(page.url(), await page.content())) {
      log('LinkedIn: Hit verification page during search')
      setLinkedInLastLoginAt(0)
      const ss = await page.screenshot({ type: 'png', fullPage: false }).then((b) => b.toString('base64')).catch(() => '')
      if (sessionId) eventBus.emit(sessionId, { type: 'error', message: 'LinkedIn requires security verification.', timestamp: Date.now() })
      return c.json({ status: 'captcha_blocked', message: 'LinkedIn requires security verification. Complete the login test first, then search.', screenshot: ss, logs }, 403)
    }

    emitProgress('search_loaded', 0.25)
    await emitScreenshot(page, 'Search results loaded')

    // Read top-level result count
    const totalAvailable = await page.evaluate(() => {
      const selectors = [
        '.jobs-search-results-list__subtitle',
        '.jobs-search-two-pane__subtitle',
        '.results-context-header__job-count',
        '.jobs-search-results-list__text',
        '[data-test-search-results-count]',
      ]
      for (const selector of selectors) {
        const el = document.querySelector(selector)
        const text = el?.textContent?.trim()
        if (text) return text
      }
      return ''
    }).then(parseLinkedInResultsCount).catch(() => undefined)
    if (totalAvailable) {
      log(`LinkedIn: Total search results reported by page: ${totalAvailable}`)
    }

    // Wait for job list to appear
    const JOB_CARD_SELECTORS = [
      'ul.jobs-search__results-list > li',
      '.base-card',
      'div[data-job-id]',
      'li[data-occludable-job-id]',
      '.job-card-container',
      '.jobs-search-results__list-item',
      '[data-view-name="job-card"]',
      '.scaffold-layout__list-item',
    ]
    log('LinkedIn: Waiting for job cards to load...')
    let matchedCardSelector: string | null = null
    try {
      const selectorRace = JOB_CARD_SELECTORS.map((sel) =>
        page!.waitForSelector(sel, { timeout: 10000 }).then(() => sel)
      )
      matchedCardSelector = await Promise.any(selectorRace)
      log('LinkedIn: Job cards found with selector: ' + matchedCardSelector)
    } catch {
      const currentUrl = page!.url()
      const debugInfo = await page!.evaluate(() => {
        const hasCaptchaFrame = !!document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha-challenge')
        const hasCheckpoint = window.location.href.includes('/checkpoint/')
        const lists = Array.from(document.querySelectorAll('[class*="job"], [class*="search-result"], [class*="scaffold"]'))
          .slice(0, 10)
          .map((el) => ({ tag: el.tagName, class: el.className.toString().slice(0, 100), children: el.children.length }))
        return { hasCaptchaFrame, hasCheckpoint, lists, title: document.title }
      }).catch(() => ({ hasCaptchaFrame: false, hasCheckpoint: false, lists: [], title: '' }))

      log('LinkedIn: No job cards found. URL: ' + currentUrl)
      log('LinkedIn: Debug info: ' + JSON.stringify(debugInfo, null, 2))

      const ss = await page!.screenshot({ type: 'png', fullPage: false }).then((b) => b.toString('base64')).catch(() => '')
      if (debugInfo.hasCaptchaFrame || debugInfo.hasCheckpoint) {
        log('LinkedIn: Actual captcha/checkpoint detected')
        if (sessionId) eventBus.emit(sessionId, { type: 'error', message: 'LinkedIn is showing a captcha.', timestamp: Date.now() })
        return c.json({ status: 'captcha_blocked', message: 'LinkedIn is showing a captcha. Try again later.', screenshot: ss, logs }, 403)
      }
      log('LinkedIn: No jobs matched the search criteria (or selectors need updating)')
      if (sessionId) eventBus.emit(sessionId, { type: 'done', message: 'No results found', timestamp: Date.now() })
      return c.json({
        status: 'ok',
        results: [],
        screenshot: ss,
        logs,
        meta: {
          mode: isFindMode ? 'find_matches' : 'scan',
          totalScanned: 0,
          totalLoaded: 0,
          totalAvailable,
          matchesFound: 0,
          targetMatches: isFindMode ? targetMatches : 0,
        },
      })
    }

    // Scroll to load cards — in find_matches mode, keep scrolling until we have enough
    const initialScrolls = isFindMode ? 6 : 3
    emitProgress('scrolling', 0.3)
    for (let i = 0; i < initialScrolls; i++) {
      await page.evaluate(() => {
        const list = document.querySelector('.jobs-search__results-list') ||
          document.querySelector('.jobs-search-results-list') ||
          document.querySelector('.scaffold-layout__list')
        if (list) {
          list.scrollTop += 400
        } else {
          window.scrollBy(0, 400)
        }
      })
      await humanDelay(800, 1500)
    }

    // Helper to scroll and load more cards
    const scrollForMore = async (p: Page): Promise<number> => {
      const prevCount = (await p.$$(matchedCardSelector!)).length
      for (let s = 0; s < 4; s++) {
        await p.evaluate(() => {
          const list = document.querySelector('.jobs-search__results-list') ||
            document.querySelector('.jobs-search-results-list') ||
            document.querySelector('.scaffold-layout__list')
          if (list) {
            list.scrollTop = list.scrollHeight
          } else {
            window.scrollBy(0, 800)
          }
        })
        await humanDelay(800, 1500)
        // Click "See more jobs" / pagination button if present
        const seeMoreBtn = await p.$('button.infinite-scroller__show-more-button, button[aria-label*="more jobs"], button[aria-label*="See more"]')
        if (seeMoreBtn) {
          await seeMoreBtn.click().catch(() => {})
          await humanDelay(1500, 2500)
        }
      }
      const newCount = (await p.$$(matchedCardSelector!)).length
      return newCount - prevCount
    }

    // Extract initial job cards
    let cards = await page.$$(matchedCardSelector!)
    const effectiveLimit = isFindMode
      ? (searchLimit > 0 ? searchLimit : Infinity)
      : Math.min(cards.length, requestedMax || 5)
    log(`LinkedIn: Found ${cards.length} job cards, mode=${isFindMode ? 'find_matches' : 'scan'}, scanning up to ${effectiveLimit === Infinity ? 'all' : effectiveLimit}${isFindMode ? ` (target ${targetMatches} matches)` : ''}`)

    const results: Array<{
      title: string
      company: string
      url: string
      externalUrl: string
      location: string
      workType?: 'remote' | 'hybrid' | 'onsite' | 'unknown'
      recruiterEmail?: string
      recruiterPhone?: string
      sponsorshipMentioned?: boolean
      sponsorshipPolicy?: 'supports' | 'no_support' | 'unknown'
      sponsorshipSnippet?: string
      matchedSkills: string[]
      missingSkills: string[]
      description: string
      matchScore?: { matched: number; total: number }
      language?: DetectedLanguage
    }> = []
    let totalScanned = 0
    let cardIndex = 0        // index within current page's cards
    let globalCardIndex = 0  // running count across all pages
    let currentPage = 1
    const maxPages = 10      // safety cap on pagination

    // Outer pagination loop
    pageLoop: while (true) {
      const pageCardCount = cards.length
      for (; cardIndex < pageCardCount; cardIndex++) {
        // Check stop conditions
        if (isFindMode && results.length >= targetMatches) break pageLoop
        if (effectiveLimit !== Infinity && globalCardIndex >= effectiveLimit) break pageLoop

        const card = cards[cardIndex]
        if (!card) continue

        const scanProgress = 0.35 + (globalCardIndex / Math.max(effectiveLimit === Infinity ? (totalAvailable || 100) : effectiveLimit, 1)) * 0.55
        emitProgress('scanning_cards', Math.min(scanProgress, 0.9))

      try {
        globalCardIndex++

        const cardInfo = await card.evaluate((el) => {
          const link = el.querySelector('a[href*="/jobs/view/"]') ||
            el.querySelector('a.base-card__full-link') ||
            el.querySelector('a.job-card-container__link') ||
            el.querySelector('a.job-card-list__title') ||
            el.querySelector('[class*="job-card"] a') ||
            el.querySelector('a[href*="/jobs/"]')
          const titleEl = el.querySelector('h3.base-search-card__title') ||
            el.querySelector('[class*="job-search-card__title"]') ||
            link
          const title = titleEl?.textContent?.trim() || ''
          const href = link?.getAttribute('href') || ''

          const companyEl = el.querySelector('h4.base-search-card__subtitle') ||
            el.querySelector('.base-search-card__subtitle') ||
            el.querySelector('[class*="job-search-card__company"]') ||
            el.querySelector('.artdeco-entity-lockup__subtitle') ||
            el.querySelector('[class*="job-card-container__primary-description"]') ||
            el.querySelector('[class*="company"]')
          const company = companyEl?.textContent?.trim() || ''

          const locEl = el.querySelector('.job-search-card__location') ||
            el.querySelector('[class*="job-search-card__location"]') ||
            el.querySelector('.artdeco-entity-lockup__caption') ||
            el.querySelector('[class*="job-card-container__metadata-item"]')
          const location = locEl?.textContent?.trim() || ''

          return { title, href, company, location }
        }).catch(() => ({ title: '', href: '', company: '', location: '' }))

        let { title, company, location: rawLocation } = cardInfo
        const href = cardInfo.href

        if (!title || !href) continue

        // LinkedIn cards often duplicate the title text (visible + hidden accessible span).
        // Also strip " with verification" suffix that LinkedIn adds for verified companies.
        title = title.replace(/ with verification$/i, '')
        const half = Math.floor(title.length / 2)
        if (title.length > 4 && title.slice(0, half) === title.slice(half)) {
          title = title.slice(0, half)
        }

        const fullUrl = href.startsWith('http') ? href.split('?')[0] : `https://www.linkedin.com${href.split('?')[0]}`

        // Skip duplicates already in the database
        if (isKnownJob(company, title, fullUrl)) {
          skippedDuplicates++
          log(`LinkedIn: Card ${globalCardIndex} (p${currentPage}): "${title}" at ${company} — skipped (already in DB)`)
          continue
        }

        // Try to get description
        let description = ''
        let contactText = ''
        const isPublicPage = matchedCardSelector === 'ul.jobs-search__results-list > li' || matchedCardSelector === '.base-card'

        if (isPublicPage) {
          description = await card.evaluate((el) => {
            const desc = el.querySelector('.base-search-card__metadata, .job-search-card__snippet, [class*="snippet"]')
            return desc?.textContent?.trim() || ''
          }).catch(() => '')
          contactText = description
        } else {
          // Annotate the card we're about to click
          if (sessionId) {
            // Pause the background loop briefly to avoid conflicting screenshots
            stopScreenshotLoop()
            const annotatedSs = await highlightAndScreenshot(page, card, { label: `Clicking card ${globalCardIndex}`, variant: 'target' })
            const frame = { data: annotatedSs, timestamp: Date.now() }
            recordedFrames.push(frame)
            eventBus.emit(sessionId, { type: 'screenshot', screenshot: annotatedSs, label: `Clicking card ${globalCardIndex}`, timestamp: frame.timestamp })
            startScreenshotLoop(page)
          }

          // Dismiss any lingering modal before clicking the card
          await dismissAnyModal(page, log)
          await card.click()
          await humanDelay(1500, 2500)
          await dismissAnyModal(page, log)
          try {
            await page.waitForSelector('.jobs-description, .jobs-box__html-content, [class*="jobs-description"]', { timeout: 5000 })
            description = await page.$eval(
              '.jobs-description, .jobs-box__html-content, [class*="jobs-description"]',
              (el) => el.textContent?.trim() || '',
            )
          } catch {
            // Description pane didn't load
          }
          contactText = await page.evaluate(() => {
            const el = document.querySelector('.jobs-search__job-details--wrapper, .jobs-details, .jobs-unified-top-card, .scaffold-layout__detail')
            return el?.textContent?.trim() || ''
          }).catch(() => '')
        }

        // Extract external apply URL
        let externalUrl = ''
        if (!isPublicPage) {
          try {
            // Helper: decode LinkedIn redirect/tracking URLs to get the real destination
            const decodeLinkedInUrl = (href: string): string => {
              // Pattern: linkedin.com/redir/redirect?url=<encoded>&...
              const redirMatch = href.match(/[?&]url=([^&]+)/)
              if (redirMatch) {
                try { return decodeURIComponent(redirMatch[1]).split('?')[0] } catch {}
              }
              // Pattern: linkedin.com/jobs/view/.../externalApply?...&url=<encoded>
              const externalMatch = href.match(/externalApply.*[?&]url=([^&]+)/)
              if (externalMatch) {
                try { return decodeURIComponent(externalMatch[1]).split('?')[0] } catch {}
              }
              return ''
            }

            // Stage 1: scan all links/buttons in the detail panel for external URLs
            externalUrl = await page.evaluate(() => {
              const decode = (href: string): string => {
                const m = href.match(/[?&]url=([^&]+)/)
                if (m) { try { return decodeURIComponent(m[1]).split('?')[0] } catch {} }
                return ''
              }

              // Broad selectors covering current and older LinkedIn layouts
              const candidates = document.querySelectorAll([
                'a.jobs-apply-button',
                'a[href*="externalApply"]',
                'a[data-job-id][href*="http"]',
                '.jobs-apply-button--top-card a',
                '.jobs-s-apply a',
                '.jobs-unified-top-card a[href*="http"]',
                '.scaffold-layout__detail a[href*="externalApply"]',
                '[class*="apply-button"] a',
                'a.apply-button',
                'a[href*="/redir/redirect"]',
              ].join(', '))

              for (const el of candidates) {
                const href = el.getAttribute('href') || ''
                if (!href) continue
                // Direct external link (not linkedin.com)
                if (href.startsWith('http') && !href.includes('linkedin.com')) {
                  return href.split('?')[0]
                }
                // LinkedIn redirect/tracking URL — decode the real destination
                if (href.includes('linkedin.com') && (href.includes('externalApply') || href.includes('/redir/') || href.includes('url='))) {
                  const decoded = decode(href)
                  if (decoded && decoded.startsWith('http') && !decoded.includes('linkedin.com')) {
                    return decoded
                  }
                }
              }
              return ''
            }).catch(() => '')

            // Stage 2: if Stage 1 found nothing, click the apply button and capture navigation
            if (!externalUrl) {
              const applyBtn = await page.$([
                'button.jobs-apply-button',
                '.jobs-apply-button--top-card button',
                '.jobs-s-apply button',
                '[class*="apply-button"] button',
                'a.jobs-apply-button',
              ].join(', '))
              if (applyBtn) {
                const btnText = (await applyBtn.textContent())?.trim().toLowerCase() || ''
                // Only click "Apply" buttons that look like external applies (not Easy Apply)
                if (btnText.includes('apply') && !btnText.includes('easy')) {
                  try {
                    const [response] = await Promise.all([
                      page.waitForEvent('popup', { timeout: 5000 }).then(async (popup) => {
                        const popupUrl = popup.url()
                        await popup.close()
                        return popupUrl
                      }).catch(() => null),
                      applyBtn.click(),
                    ])
                    if (response && response.startsWith('http') && !response.includes('linkedin.com')) {
                      externalUrl = response.split('?')[0]
                    }
                  } catch {
                    // Click-to-capture failed
                  }
                  // Dismiss "Share your profile?" modal if it appeared after clicking Apply
                  await dismissAnyModal(page, log)
                  // If a popup opened and redirected, wait for the page to settle
                  if (externalUrl) {
                    await humanDelay(500, 1000)
                  }
                }
              }
            }

            // Stage 3: fallback — try the current page URL if we navigated away from LinkedIn
            if (!externalUrl) {
              const currentUrl = page.url()
              if (currentUrl.startsWith('http') && !currentUrl.includes('linkedin.com')) {
                externalUrl = currentUrl.split('?')[0]
                // Navigate back since we left the search results
                await page.goBack()
                await humanDelay(1000, 2000)
              }
            }
          } catch {
            // External URL extraction failed
          }
        }
        // Final guard: externalUrl must never be a LinkedIn URL
        if (externalUrl && externalUrl.includes('linkedin.com')) {
          externalUrl = ''
        }
        if (externalUrl) {
          log(`LinkedIn: Card ${globalCardIndex} (p${currentPage}): External URL: ${externalUrl}`)
        }

        // Language detection
        const language: DetectedLanguage = detectLanguage(`${title} ${description}`)

        // Filter out German descriptions if requested
        if (excludeGerman && language === 'de') {
          skippedGerman++
          log(`LinkedIn: Card ${globalCardIndex} (p${currentPage}): "${title}" at ${company} — skipped (German description)`)
          continue
        }

        // Skills matching
        const combined = `${title} ${description}`.toLowerCase()
        const workType = inferWorkType(rawLocation, title, description, contactText)
        const jobLocation = cleanLocation(rawLocation)
        const { recruiterEmail, recruiterPhone } = extractRecruiterContacts(`${description}\n${contactText}`)
        const { sponsorshipMentioned, sponsorshipPolicy, sponsorshipSnippet } = detectSponsorship(`${title}\n${description}\n${contactText}`)
        const matchedSkills: string[] = []
        const missingSkills: string[] = []
        for (const skill of skills) {
          const s = skill.trim()
          if (!s) continue
          if (combined.includes(s.toLowerCase())) {
            matchedSkills.push(s)
          } else {
            missingSkills.push(s)
          }
        }

        totalScanned++
        const matchScore = skills.length > 0 ? { matched: matchedSkills.length, total: skills.length } : undefined

        if (isFindMode && matchedSkills.length < minSkillMatch) {
          log(`LinkedIn: Card ${globalCardIndex} (p${currentPage}): "${title}" at ${company} — skipped (${matchedSkills.length}/${skills.length} skills, need ${minSkillMatch})`)
          continue
        }

        // Annotate screenshot for extracted card (green)
        if (sessionId && !isPublicPage) {
          stopScreenshotLoop()
          const annotatedSs = await highlightAndScreenshot(page, card, { label: `Matched: ${title}`, variant: 'active' })
          const frame = { data: annotatedSs, timestamp: Date.now() }
          recordedFrames.push(frame)
          eventBus.emit(sessionId, { type: 'screenshot', screenshot: annotatedSs, label: `Extracting: ${title}`, timestamp: frame.timestamp })
          startScreenshotLoop(page)
        }

        log(`LinkedIn: Card ${globalCardIndex} (p${currentPage}): "${title}" at ${company} (${matchedSkills.length}/${skills.length} skill matches)${isFindMode ? ` [match ${results.length + 1}/${targetMatches}]` : ''}`)
        const resultItem = {
          title,
          company,
          url: fullUrl,
          externalUrl,
          location: jobLocation,
          workType,
          recruiterEmail,
          recruiterPhone,
          sponsorshipMentioned,
          sponsorshipPolicy,
          sponsorshipSnippet,
          matchedSkills,
          missingSkills,
          description: description.slice(0, 500),
          matchScore,
          language,
        }
        results.push(resultItem)
        if (sessionId) {
          eventBus.emit(sessionId, { type: 'result', result: resultItem, timestamp: Date.now() })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // If error was caused by a modal overlay, try to dismiss it before continuing
        if (msg.includes('intercepts pointer events') || msg.includes('artdeco-modal')) {
          log(`LinkedIn: Modal blocked card ${globalCardIndex} — attempting to dismiss`)
          await dismissAnyModal(page, log)
        } else {
          log(`LinkedIn: Error extracting card ${globalCardIndex}: ${msg}`)
        }
        continue
      }
      } // end for (cardIndex)

      // In scan mode, don't paginate — just process loaded cards
      if (!isFindMode) break

      // Check if we've met the target
      if (results.length >= targetMatches) break

      // Check if we've hit the search limit
      if (effectiveLimit !== Infinity && globalCardIndex >= effectiveLimit) {
        log(`LinkedIn: Reached search limit (${effectiveLimit}), stopping`)
        break
      }

      // Try scrolling for more cards on this page first
      const newFromScroll = await scrollForMore(page)
      if (newFromScroll > 0) {
        cards = await page.$$(matchedCardSelector!)
        log(`LinkedIn: Scrolled and found ${newFromScroll} more cards (${cards.length} total on page)`)
        // cardIndex stays where it was, loop continues with new cards
        continue
      }

      // Try clicking "Next" to go to the next page
      if (currentPage >= maxPages) {
        log(`LinkedIn: Reached max pages (${maxPages}), stopping`)
        break
      }

      const nextBtn = await page.$([
        '.artdeco-pagination__button--next:not([disabled])',
        'button[aria-label="View next page"]',
        'a[aria-label="View next page"]',
        'button[aria-label="Next"]',
        'a[aria-label="Next"]',
      ].join(', '))

      if (!nextBtn) {
        log(`LinkedIn: No "Next" button found — reached end of results`)
        break
      }

      log(`LinkedIn: Clicking Next (page ${currentPage} → ${currentPage + 1})...`)
      // Dismiss any modal that might block the pagination click
      await dismissAnyModal(page, log)
      await nextBtn.click()
      await humanDelay(2000, 3500)
      await waitForFullLoad(page)
      currentPage++
      cardIndex = 0

      // Wait for job cards on the new page
      try {
        await page.waitForSelector(matchedCardSelector!, { timeout: 10000 })
      } catch {
        log(`LinkedIn: No job cards found on page ${currentPage}, stopping`)
        break
      }

      // Scroll the new page to load cards
      for (let s = 0; s < 3; s++) {
        await page.evaluate(() => {
          const list = document.querySelector('.jobs-search__results-list') ||
            document.querySelector('.jobs-search-results-list') ||
            document.querySelector('.scaffold-layout__list')
          if (list) { list.scrollTop += 400 } else { window.scrollBy(0, 400) }
        })
        await humanDelay(800, 1500)
      }

      cards = await page.$$(matchedCardSelector!)
      log(`LinkedIn: Page ${currentPage}: found ${cards.length} job cards`)

      if (cards.length === 0) {
        log(`LinkedIn: No cards on page ${currentPage}, stopping`)
        break
      }
    } // end pageLoop

    // Stop the background screenshot loop
    stopScreenshotLoop()
    await clearOverlay(page).catch(() => {})

    // Take a final debug screenshot
    let screenshot = ''
    try {
      const buf = await page.screenshot({ type: 'png', fullPage: false })
      screenshot = buf.toString('base64')
      log('LinkedIn: Screenshot captured')
    } catch (err) {
      log('LinkedIn: Screenshot failed: ' + (err instanceof Error ? err.message : String(err)))
    }

    if (skippedDuplicates > 0) {
      log(`LinkedIn: Skipped ${skippedDuplicates} duplicate(s) already in database`)
    }
    if (skippedGerman > 0) {
      log(`LinkedIn: Skipped ${skippedGerman} German description(s)`)
    }
    log(`LinkedIn: Search complete, returning ${results.length} results (scanned ${totalScanned}/${cards.length}, ${skippedDuplicates} duplicates skipped, ${skippedGerman} German skipped)`)

    // Emit done event for SSE subscribers
    if (sessionId) {
      eventBus.emit(sessionId, { type: 'done', message: `Found ${results.length} results`, timestamp: Date.now() })
      eventBus.cleanup(sessionId)

      // Save recording to disk
      if (recordedFrames.length > 0) {
        saveRecording(sessionId, recordedFrames, logs)
      }
    }

    return c.json({
      status: 'ok',
      results,
      screenshot,
      logs,
      sessionId: sessionId || undefined,
      meta: {
        mode: isFindMode ? 'find_matches' : 'scan',
        totalScanned,
        totalLoaded: cards.length,
        totalAvailable,
        matchesFound: results.length,
        targetMatches: isFindMode ? targetMatches : results.length,
        skippedDuplicates,
        skippedGerman,
      },
    })
  } catch (err) {
    stopScreenshotLoop()
    const rawMessage = err instanceof Error ? err.message : String(err)
    // Provide a friendlier error when a LinkedIn modal blocked interaction
    const isModalError = rawMessage.includes('intercepts pointer events') || rawMessage.includes('artdeco-modal')
    const message = isModalError
      ? 'A LinkedIn popup blocked the page and could not be dismissed. Try running the search again — these popups are usually one-time.'
      : rawMessage
    log('LinkedIn search error: ' + rawMessage)
    // Last-ditch attempt to dismiss the blocking modal for the screenshot
    if (isModalError && page) {
      await dismissAnyModal(page, log).catch(() => {})
    }
    let errorScreenshot = ''
    if (page) {
      try {
        const buf = await page.screenshot({ type: 'png', fullPage: false })
        errorScreenshot = buf.toString('base64')
        log('LinkedIn: Error screenshot captured')
      } catch { /* screenshot failed */ }
    }

    if (sessionId) {
      await emitScreenshot(page!).catch(() => {})
      eventBus.emit(sessionId, { type: 'error', message, timestamp: Date.now() })
      eventBus.cleanup(sessionId)
      if (recordedFrames.length > 0) {
        saveRecording(sessionId, recordedFrames, logs)
      }
    }

    return c.json({ status: 'error', message, logs, screenshot: errorScreenshot || undefined }, 500)
  } finally {
    if (page) await page.close().catch(() => {})
  }
})
