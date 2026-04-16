import type { Page } from 'playwright'
import { humanDelay, humanType, waitForFullLoad } from './humanize'
import { getLinkedInContext } from '../browser'

// --- Login state tracking ---

export let linkedInLastLoginAt = 0

export function setLinkedInLastLoginAt(ts: number) {
  linkedInLastLoginAt = ts
}

/** Consider login valid for 30 minutes */
export function isLoginRecent(): boolean {
  return linkedInLastLoginAt > 0 && (Date.now() - linkedInLastLoginAt) < 30 * 60 * 1000
}

// --- Login check ---

function isLoggedInByTitle(title: string): boolean {
  const t = title.toLowerCase()
  return t.includes('feed') || t.includes('home')
}

export function isOnVerificationPage(url: string, content: string): boolean {
  return (
    url.includes('/checkpoint/challenge') ||
    url.includes('/checkpoint/lg/') ||
    url.includes('/check/manage-account') ||
    content.includes('two-step verification') ||
    content.includes('verify it') ||
    content.includes('Approve from your') ||
    content.includes('we need to verify') ||
    content.includes('Quick verification') ||
    content.includes('Let&#39;s do a quick verification')
  )
}

export async function isLinkedInLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await humanDelay(1000, 2000)
    const title = await page.title()
    const url = page.url()
    console.log('LinkedIn: Login check - URL:', url, 'Title:', title)

    if (isLoggedInByTitle(title) || url.includes('/feed')) return true

    const hasGlobalNav = await page.evaluate(() => {
      return !!document.querySelector('#global-nav, .global-nav, [data-test-global-nav]')
    }).catch(() => false)
    if (hasGlobalNav) {
      console.log('LinkedIn: Logged in (global nav detected)')
      return true
    }

    if (url.includes('/login') || url.includes('/authwall')) {
      console.log('LinkedIn: Not logged in (redirected to login)')
      return false
    }

    return false
  } catch {
    return false
  }
}

// --- Login flow ---

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'credentials' | 'captcha' | 'verification_pending' | 'error'; message: string }

export async function linkedInLogin(page: Page, email: string, password: string, waitForVerification = false): Promise<LoginResult> {
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await waitForFullLoad(page)

  await humanType(page, '#username', email)
  await humanDelay(500, 1000)
  await humanType(page, '#password', password)
  await humanDelay(500, 1000)

  await page.click('button[type=submit]')
  await page.waitForLoadState('load', { timeout: 15000 })
  await humanDelay(2000, 4000)

  const title = await page.title()
  const currentUrl = page.url()
  console.log('LinkedIn login: After submit - URL:', currentUrl, 'Title:', title)

  if (isLoggedInByTitle(title) || currentUrl.includes('/feed') || currentUrl.includes('/mynetwork') || currentUrl.includes('/in/')) {
    console.log('LinkedIn login: Success (no 2FA needed)')
    return { ok: true }
  }

  if (currentUrl.includes('/onboarding') || currentUrl.includes('/start') || currentUrl.includes('/welcome')) {
    console.log('LinkedIn login: Success (redirected to onboarding)')
    return { ok: true }
  }

  const content = await page.content()

  if (isOnVerificationPage(currentUrl, content)) {
    console.log('LinkedIn login: Verification/2FA required, waitForVerification:', waitForVerification)
    if (!waitForVerification) {
      return {
        ok: false,
        reason: 'verification_pending',
        message: 'LinkedIn sent a push notification to your phone. Approve it, then click "I Approved It".',
      }
    }

    console.log('LinkedIn: Waiting for push notification approval (up to 60s)...')
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      await humanDelay(3000, 5000)

      const nowUrl = page.url()
      const nowTitle = await page.title()

      if (isLoggedInByTitle(nowTitle) || nowUrl.includes('/feed')) {
        console.log('LinkedIn: Verification approved!')
        return { ok: true }
      }

      if (!isOnVerificationPage(nowUrl, await page.content())) {
        break
      }
    }

    const finalTitle = await page.title()
    if (isLoggedInByTitle(finalTitle)) {
      return { ok: true }
    }
    return {
      ok: false,
      reason: 'verification_pending',
      message: 'Verification timed out. Approve the push notification on your LinkedIn app and try again.',
    }
  }

  const hasCaptchaIndicator = await page.evaluate(() => {
    return !!document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha-challenge')
  }).catch(() => false)
  if (hasCaptchaIndicator || currentUrl.includes('challenge/recaptcha')) {
    console.log('LinkedIn login: CAPTCHA detected')
    return { ok: false, reason: 'captcha', message: 'LinkedIn requires a CAPTCHA. Try running the Playwright server with headless=false.' }
  }

  const hasGlobalNav = await page.evaluate(() => {
    return !!document.querySelector('#global-nav, .global-nav, [data-test-global-nav]')
  }).catch(() => false)
  if (hasGlobalNav) {
    console.log('LinkedIn login: Success (global nav detected on unexpected page:', currentUrl, ')')
    return { ok: true }
  }

  console.log('LinkedIn login: Failed - no success indicators found. URL:', currentUrl, 'Title:', title)
  return { ok: false, reason: 'credentials', message: 'Login failed. Check your credentials.' }
}

/**
 * Shared login orchestration used by both search and apply routes.
 * Ensures LinkedIn is logged in, attempting login if needed.
 * Returns null on success, or an error object to return to the client.
 */
export async function ensureLinkedInLoggedIn(
  page: Page,
  linkedInEmail: string,
  linkedInPassword: string,
  log: (msg: string) => void = console.log,
): Promise<{ status: string; message: string; httpStatus: 401 | 403 } | null> {
  if (isLoginRecent()) {
    log('LinkedIn: Login still valid (last login ' + Math.round((Date.now() - linkedInLastLoginAt) / 1000) + ' seconds ago)')
    return null
  }

  log('LinkedIn: Checking login status...')
  const loggedIn = await isLinkedInLoggedIn(page)
  if (!loggedIn) {
    log('LinkedIn: Not logged in, attempting login...')
    const loginResult = await linkedInLogin(page, linkedInEmail, linkedInPassword)
    if (!loginResult.ok) {
      log('LinkedIn: Login failed - ' + loginResult.reason + ' ' + loginResult.message)
      const statusMap = { credentials: 'auth_error', captcha: 'captcha_blocked', verification_pending: 'verification_pending', error: 'error' } as const
      return {
        status: statusMap[loginResult.reason],
        message: loginResult.message,
        httpStatus: loginResult.reason === 'credentials' ? 401 : 403,
      }
    }
    log('LinkedIn: Login successful')
    linkedInLastLoginAt = Date.now()
  } else {
    log('LinkedIn: Already logged in')
    linkedInLastLoginAt = Date.now()
  }

  return null
}
