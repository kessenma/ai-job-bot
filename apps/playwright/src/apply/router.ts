import { Hono } from 'hono'
import type { Page } from 'playwright'
import { getBrowser, getLinkedInContext } from '../browser'
import { getHandler } from './handlers/index.ts'
import type { ApplyProfile, ApplyResult } from './handlers/base.ts'
import { dismissCookieConsent } from '../shared/cookie-consent'
import { findAndClickApply } from '../shared/apply-button'
import { fillForm, type FormProfile } from '../shared/form-filler'
import { eventBus } from '../shared/event-bus'
import {
  linkedInLastLoginAt, setLinkedInLastLoginAt,
  isLoginRecent, isLinkedInLoggedIn, linkedInLogin,
  ensureLinkedInLoggedIn,
} from '../shared/linkedin-auth'
import { takeScreenshot } from '../shared/click-overlay'

export const applyRouter = new Hono()

// --- Generic ATS apply ---

applyRouter.post('/apply', async (c) => {
  const body = await c.req.json<{ url: string; profile: ApplyProfile }>()
  const { url, profile } = body

  const handler = getHandler(url)
  if (!handler) {
    return c.json({ error: `No handler for URL: ${url}` }, 400)
  }

  const b = await getBrowser()
  const context = await b.newContext()
  const page = await context.newPage()

  try {
    const result: ApplyResult = await handler.apply(page, url, profile)
    return c.json({ handler: handler.name, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  } finally {
    await context.close()
  }
})

// --- Fill form endpoint ---

applyRouter.post('/fill-form', async (c) => {
  const body = await c.req.json<{ url: string; profile: FormProfile; sessionId?: string }>()
  const { url, profile, sessionId } = body

  if (!url || !profile) {
    return c.json({ error: 'url and profile are required' }, 400)
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    log('Page loaded')
    emit('progress', { stage: 'page_loaded', progress: 0.2 })

    const dismissedCookies = await dismissCookieConsent(page)
    if (dismissedCookies) log('Dismissed cookie consent')

    const applyResult = await findAndClickApply(page)
    if (applyResult.clicked) {
      log(`Clicked apply button: "${applyResult.buttonText}"`)
      emit('progress', { stage: 'clicked_apply', progress: 0.3 })
      await dismissCookieConsent(page)
    }

    await page.waitForTimeout(1500)

    log('Filling form fields...')
    emit('progress', { stage: 'filling', progress: 0.5 })
    const { filled, skipped } = await fillForm(page, profile, log)
    log(`Filled ${filled.length} fields, skipped ${skipped.length}`)
    emit('progress', { stage: 'filled', progress: 0.8 })

    await page.waitForTimeout(500)

    log('Taking screenshot')
    emit('progress', { stage: 'capturing', progress: 0.9 })
    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: true })
    const screenshot = screenshotBuffer.toString('base64')
    emit('screenshot', { screenshot })

    const title = await page.title().catch(() => null)
    const finalUrl = page.url()
    const timeMs = Date.now() - start

    log(`Done in ${timeMs}ms`)
    emit('done', { message: `Form filled in ${timeMs}ms` })
    if (sessionId) eventBus.cleanup(sessionId)

    return c.json({
      screenshot,
      title,
      url: finalUrl,
      filled,
      skipped,
      actions: {
        dismissedCookies,
        clickedApply: applyResult.clicked,
        applyButtonText: applyResult.buttonText,
        navigatedTo: applyResult.clicked ? finalUrl : null,
      },
      timeMs,
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

// --- Workday auth endpoints ---

applyRouter.post('/workday/create-account', async (c) => {
  const body = await c.req.json<{ url: string; email: string; password: string }>()
  const { url, email, password } = body

  if (!url || !email || !password) {
    return c.json({ error: 'url, email, and password are required' }, 400)
  }

  const b = await getBrowser()
  const context = await b.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(15000)

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const adventureButton = 'a[data-automation-id="adventureButton"]'
    try {
      await page.waitForSelector(adventureButton, { timeout: 5000 })
      await page.locator(adventureButton).click()
      await page.waitForTimeout(1000)

      try {
        await page.waitForSelector(adventureButton, { timeout: 2000 })
        await page.locator(adventureButton).click()
        await page.waitForTimeout(1000)
      } catch { /* only one button */ }

      const applyManually = 'a[data-automation-id="applyManually"]'
      try {
        await page.waitForSelector(applyManually, { timeout: 3000 })
        await page.locator(applyManually).click()
        await page.waitForTimeout(1000)
      } catch { /* direct apply */ }
    } catch {
      return c.json({ error: 'Could not find Apply button on the page' }, 400)
    }

    const signInButton = 'button[data-automation-id="utilityButtonSignIn"]'
    try {
      await page.waitForSelector(signInButton, { timeout: 5000 })
    } catch {
      const screenshot = await page.screenshot({ type: 'png', fullPage: false })
      return c.json({
        status: 'no_auth_required',
        message: 'No sign-in button found — application may not require auth',
        screenshot: screenshot.toString('base64'),
      })
    }

    await page.locator(signInButton).click()
    await page.waitForTimeout(500)

    await page.locator('input[data-automation-id="email"]').fill(email)
    await page.locator('input[data-automation-id="password"]').fill(password)
    await page.locator('button[data-automation-id="signInSubmitButton"]').click({ delay: 500 })
    await page.waitForTimeout(2000)

    const errorSel = 'div[data-automation-id="errorMessage"]'
    let hasError = false
    try {
      await page.waitForSelector(errorSel, { timeout: 3000 })
      hasError = true
    } catch { /* no error = success */ }

    if (!hasError) {
      const screenshot = await page.screenshot({ type: 'png', fullPage: false })
      return c.json({
        status: 'signed_in',
        message: 'Successfully signed in with existing account',
        screenshot: screenshot.toString('base64'),
      })
    }

    const createAccountLink = 'button[data-automation-id="createAccountLink"]'
    try {
      await page.waitForSelector(createAccountLink, { timeout: 3000 })
      await page.locator(createAccountLink).click()
      await page.waitForTimeout(500)
    } catch {
      const screenshot = await page.screenshot({ type: 'png', fullPage: false })
      return c.json({
        status: 'error',
        message: 'Could not find Create Account button',
        screenshot: screenshot.toString('base64'),
      }, 400)
    }

    await page.locator('input[data-automation-id="email"]').fill(email)
    await page.locator('input[data-automation-id="password"]').fill(password)
    await page.locator('input[data-automation-id="verifyPassword"]').fill(password)

    const checkbox = 'input[data-automation-id="createAccountCheckbox"]'
    try {
      await page.waitForSelector(checkbox, { timeout: 1000 })
      await page.click(checkbox)
    } catch { /* no checkbox */ }

    await page.locator('button[data-automation-id="createAccountSubmitButton"]').click()
    await page.waitForTimeout(3000)

    const screenshot = await page.screenshot({ type: 'png', fullPage: false })

    let createError = false
    try {
      await page.waitForSelector(errorSel, { timeout: 2000 })
      createError = true
    } catch { /* no error = success */ }

    if (createError) {
      const errorText = await page.textContent(errorSel).catch(() => 'Unknown error')
      return c.json({
        status: 'create_failed',
        message: `Account creation failed: ${errorText}`,
        screenshot: screenshot.toString('base64'),
      })
    }

    return c.json({
      status: 'verification_needed',
      message: 'Account created. Check email for verification link.',
      screenshot: screenshot.toString('base64'),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const screenshot = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null)
    return c.json({
      status: 'error',
      message,
      screenshot: screenshot?.toString('base64'),
    }, 500)
  } finally {
    await context.close()
  }
})

applyRouter.post('/workday/verify-and-signin', async (c) => {
  const body = await c.req.json<{ verificationLink: string; jobUrl: string; email: string; password: string }>()
  const { verificationLink, jobUrl, email, password } = body

  if (!verificationLink || !jobUrl || !email || !password) {
    return c.json({ error: 'verificationLink, jobUrl, email, and password are required' }, 400)
  }

  const b = await getBrowser()
  const context = await b.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(15000)

  try {
    await page.goto(verificationLink, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    const verifyScreenshot = await page.screenshot({ type: 'png', fullPage: false })

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const adventureButton = 'a[data-automation-id="adventureButton"]'
    try {
      await page.waitForSelector(adventureButton, { timeout: 5000 })
      await page.locator(adventureButton).click()
      await page.waitForTimeout(1000)
      try {
        await page.waitForSelector(adventureButton, { timeout: 2000 })
        await page.locator(adventureButton).click()
        await page.waitForTimeout(1000)
      } catch { /* single button */ }

      const applyManually = 'a[data-automation-id="applyManually"]'
      try {
        await page.waitForSelector(applyManually, { timeout: 3000 })
        await page.locator(applyManually).click()
        await page.waitForTimeout(1000)
      } catch { /* direct apply */ }
    } catch {
      return c.json({ status: 'error', message: 'Could not find Apply button after verification' }, 400)
    }

    const signInButton = 'button[data-automation-id="utilityButtonSignIn"]'
    try {
      await page.waitForSelector(signInButton, { timeout: 5000 })
      await page.locator(signInButton).click()
      await page.waitForTimeout(500)

      await page.locator('input[data-automation-id="email"]').fill(email)
      await page.locator('input[data-automation-id="password"]').fill(password)
      await page.locator('button[data-automation-id="signInSubmitButton"]').click({ delay: 500 })
      await page.waitForTimeout(3000)
    } catch {
      const screenshot = await page.screenshot({ type: 'png', fullPage: false })
      return c.json({
        status: 'error',
        message: 'Could not complete sign-in after verification',
        screenshot: screenshot.toString('base64'),
      })
    }

    const contactPage = 'div[data-automation-id="contactInformationPage"]'
    let inForm = false
    try {
      await page.waitForSelector(contactPage, { timeout: 10000 })
      inForm = true
    } catch { /* not in form */ }

    const screenshot = await page.screenshot({ type: 'png', fullPage: false })

    return c.json({
      status: inForm ? 'ready' : 'signed_in',
      message: inForm ? 'Verified, signed in, and in the application form' : 'Verified and signed in, but not yet in the form',
      screenshot: screenshot.toString('base64'),
      verifyScreenshot: verifyScreenshot.toString('base64'),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const screenshot = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null)
    return c.json({
      status: 'error',
      message,
      screenshot: screenshot?.toString('base64'),
    }, 500)
  } finally {
    await context.close()
  }
})

// --- LinkedIn Easy Apply ---

applyRouter.post('/linkedin-easy-apply', async (c) => {
  const body = await c.req.json<{
    jobUrl: string
    profile: import('./linkedin-easy-apply').EasyApplyProfile
    dryRun?: boolean
    linkedinEmail?: string
    linkedinPassword?: string
  }>()
  const linkedInEmail = body.linkedinEmail || process.env.LINKEDIN_EMAIL
  const linkedInPassword = body.linkedinPassword || process.env.LINKEDIN_PASSWORD

  if (!linkedInEmail || !linkedInPassword) {
    return c.json({
      status: 'auth_error',
      message: 'LinkedIn credentials are not configured.',
    }, 400)
  }
  const { jobUrl, profile, dryRun } = body

  if (!jobUrl?.trim()) {
    return c.json({ status: 'error', message: 'jobUrl is required' }, 400)
  }

  let page: Page | null = null

  try {
    const { easyApply } = await import('./linkedin-easy-apply')
    const ctx = await getLinkedInContext()
    page = await ctx.newPage()

    // Login orchestration
    const loginError = await ensureLinkedInLoggedIn(page, linkedInEmail, linkedInPassword)
    if (loginError) {
      return c.json({ status: loginError.status, message: loginError.message }, loginError.httpStatus)
    }

    // Run Easy Apply
    console.log('LinkedIn Easy Apply: Starting for', jobUrl)
    const result = await easyApply(page, jobUrl, profile, dryRun)

    let screenshot = ''
    try {
      const buf = await page.screenshot({ type: 'png', fullPage: false })
      screenshot = buf.toString('base64')
    } catch { /* screenshot failed */ }

    console.log(`LinkedIn Easy Apply: ${result.status} (${result.stepsCompleted} steps, ${result.answeredQuestions.length} answered, ${result.unansweredQuestions.length} unanswered)`)
    return c.json({ ...result, screenshot })
  } catch (err) {
    let screenshot = ''
    if (page) {
      try {
        const buf = await page.screenshot({ type: 'png', fullPage: false })
        screenshot = buf.toString('base64')
      } catch { /* screenshot failed */ }
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error('LinkedIn Easy Apply error:', message)
    return c.json({ status: 'error', message, screenshot }, 500)
  } finally {
    if (page) await page.close().catch(() => {})
  }
})

// --- LinkedIn login test ---

applyRouter.post('/linkedin-login-test', async (c) => {
  const body = await c.req.json<{
    waitForVerification?: boolean
    linkedinEmail?: string
    linkedinPassword?: string
    sessionId?: string
  }>().catch(() => ({ waitForVerification: false, linkedinEmail: undefined, linkedinPassword: undefined, sessionId: undefined }))
  const linkedInEmail = body.linkedinEmail || process.env.LINKEDIN_EMAIL
  const linkedInPassword = body.linkedinPassword || process.env.LINKEDIN_PASSWORD
  const sessionId = body.sessionId || null

  const emit = (type: 'log' | 'progress' | 'screenshot' | 'done' | 'error', data?: Partial<{ message: string; stage: string; progress: number; screenshot: string }>) => {
    if (!sessionId) return
    eventBus.emit(sessionId, { type, ...data, timestamp: Date.now() })
  }

  const emitScreenshot = async (page: Page, stage?: string) => {
    if (!sessionId) return
    try {
      const ss = await takeScreenshot(page)
      emit('screenshot', { screenshot: ss })
      if (stage) emit('progress', { stage, progress: 0.5 })
    } catch { /* screenshot failed */ }
  }

  if (!linkedInEmail || !linkedInPassword) {
    emit('error', { message: 'LinkedIn credentials are not configured.' })
    emit('done')
    return c.json({
      status: 'not_configured',
      message: 'LinkedIn credentials are not configured.',
    })
  }

  const waitForVerification = body.waitForVerification ?? false

  let page: Page | null = null
  let screenshotInterval: ReturnType<typeof setInterval> | null = null

  const startScreenshotLoop = (p: Page) => {
    if (!sessionId) return
    screenshotInterval = setInterval(async () => {
      try {
        const ss = await takeScreenshot(p)
        emit('screenshot', { screenshot: ss })
      } catch { /* page might be navigating */ }
    }, 1500)
  }

  const stopScreenshotLoop = () => {
    if (screenshotInterval) { clearInterval(screenshotInterval); screenshotInterval = null }
  }

  try {
    emit('log', { message: 'Opening LinkedIn...' })
    emit('progress', { stage: 'opening', progress: 0.1 })
    const ctx = await getLinkedInContext()
    page = await ctx.newPage()

    startScreenshotLoop(page)

    emit('log', { message: 'Checking login status...' })
    emit('progress', { stage: 'checking_login', progress: 0.2 })
    const loggedIn = await isLinkedInLoggedIn(page)
    await emitScreenshot(page, 'checking_login')
    if (loggedIn) {
      setLinkedInLastLoginAt(Date.now())
      emit('log', { message: 'Already logged in to LinkedIn.' })
      emit('progress', { stage: 'done', progress: 1 })
      await emitScreenshot(page)
      emit('done', { message: 'Already logged in to LinkedIn.' })
      return c.json({ status: 'connected', message: 'Already logged in to LinkedIn.' })
    }

    emit('log', { message: 'Attempting login...' })
    emit('progress', { stage: 'logging_in', progress: 0.4 })
    console.log('LinkedIn test: Attempting login...')
    const loginResult = await linkedInLogin(page, linkedInEmail, linkedInPassword, waitForVerification)
    await emitScreenshot(page)
    if (loginResult.ok) {
      setLinkedInLastLoginAt(Date.now())
      emit('log', { message: 'Login successful!' })
      emit('progress', { stage: 'done', progress: 1 })
      await emitScreenshot(page)
      emit('done', { message: 'Successfully logged in to LinkedIn.' })
      console.log('LinkedIn test: Login successful')
      return c.json({ status: 'connected', message: 'Successfully logged in to LinkedIn.' })
    }
    console.log('LinkedIn test: Login failed -', loginResult.reason, loginResult.message)

    const statusMap = {
      credentials: 'failed',
      captcha: 'captcha_blocked',
      verification_pending: 'verification_pending',
      error: 'error',
    } as const

    emit('log', { message: `Login result: ${loginResult.message}` })
    await emitScreenshot(page)
    if (loginResult.reason === 'verification_pending') {
      emit('progress', { stage: 'verification_pending', progress: 0.6 })
    } else {
      emit('error', { message: loginResult.message })
    }
    emit('done', { message: loginResult.message })

    return c.json({ status: statusMap[loginResult.reason], message: loginResult.message })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit('error', { message })
    emit('done', { message })
    return c.json({ status: 'error', message }, 500)
  } finally {
    stopScreenshotLoop()
    if (sessionId) eventBus.cleanup(sessionId)
    if (page) await page.close().catch(() => {})
  }
})
