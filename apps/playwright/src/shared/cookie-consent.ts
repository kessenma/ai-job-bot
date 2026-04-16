import type { Page } from 'playwright'

export const COOKIE_BUTTON_SELECTORS = [
  // Common cookie consent button IDs/classes
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '#accept-cookie-consent',
  '#cookie-accept',
  '#cookie-consent-accept',
  '#gdpr-accept',
  '#cookieConsent button',
  '.cookie-accept',
  '.cookie-consent-accept',
  '.js-accept-cookies',
  '.accept-cookies',
  '[data-testid="cookie-accept"]',
  '[data-cookie-accept]',
  // Common consent management platforms
  '.cc-accept', // cookie consent by Osano
  '.cc-btn.cc-dismiss',
  '#hs-eu-confirmation-button', // HubSpot
  '.consent-banner__accept', // various
  '#didomi-notice-agree-button', // Didomi
  '.evidon-banner-acceptbutton', // Evidon/Crownpeak
  '#truste-consent-button', // TrustArc
  '#consent_prompt_submit', // various
  '.qc-cmp2-summary-buttons button:first-child', // Quantcast
]

// Locator-based text patterns for Playwright's :has-text / getByRole matching
// These use substring matching so they handle nested elements and whitespace naturally
const COOKIE_ACCEPT_TEXTS_EN = [
  'Accept all', 'Accept cookies', 'Accept and continue',
  'Accept', 'Agree', 'Allow all', 'Allow cookies',
  'Got it', 'I agree', 'I accept', 'I understand',
]
const COOKIE_ACCEPT_TEXTS_DE = [
  'Akzeptieren und fortfahren', 'Alle akzeptieren', 'Alle Cookies akzeptieren',
  'Akzeptieren', 'Zustimmen und weiter', 'Zustimmen und fortfahren',
  'Zustimmen', 'Einverstanden', 'Alle erlauben', 'Erlauben',
  'Cookies annehmen', 'Annehmen', 'Verstanden', 'Alles klar',
  'Ich stimme zu', 'Ja, ich akzeptiere',
]
const COOKIE_ACCEPT_TEXTS = [...COOKIE_ACCEPT_TEXTS_DE, ...COOKIE_ACCEPT_TEXTS_EN]

export async function dismissCookieConsent(page: Page): Promise<boolean> {
  // Wait for CMP scripts to initialize (they load async after domcontentloaded)
  // Try to detect specific CMPs and wait for them, falling back to a fixed delay
  try {
    await page.waitForSelector('#usercentrics-root, #onetrust-banner-sdk, #CybotCookiebotDialog, #didomi-popup, .qc-cmp2-container', { timeout: 3000 })
    // Give the CMP a moment to fully initialize its JS API after DOM appears
    await page.waitForTimeout(500)
  } catch {
    // No known CMP element detected within 3s — use a shorter fallback wait
    await page.waitForTimeout(1000)
  }

  // Strategy 0: Call CMP JavaScript APIs directly — bypasses all DOM/shadow DOM issues
  // Try up to 3 times with increasing waits, since CMPs may not be ready yet
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const apiDismissed = await page.evaluate(() => {
        // Usercentrics (very common in Germany)
        if (typeof (window as any).UC_UI !== 'undefined') {
          try { (window as any).UC_UI.acceptAllConsents(); return 'UC_UI' } catch {}
        }
        // Cookiebot
        if (typeof (window as any).Cookiebot !== 'undefined') {
          try { (window as any).Cookiebot.submitCustomConsent(true, true, true); return 'Cookiebot' } catch {}
        }
        // OneTrust
        if (typeof (window as any).OneTrust !== 'undefined') {
          try { (window as any).OneTrust.AllowAll(); return 'OneTrust' } catch {}
        }
        // TCF v2 API (IAB standard used by many CMPs)
        if (typeof (window as any).__tcfapi !== 'undefined') {
          try {
            (window as any).__tcfapi('setConsent', 2, () => {}, { consentAll: true })
            return 'TCF'
          } catch {}
        }
        // Didomi
        if (typeof (window as any).Didomi !== 'undefined') {
          try { (window as any).Didomi.setUserAgreeToAll(); return 'Didomi' } catch {}
        }
        // Quantcast
        if (typeof (window as any).__cmp !== 'undefined') {
          try { (window as any).__cmp('setConsent', { vendorConsents: {}, purposeConsents: {} }); return 'cmp' } catch {}
        }
        return null
      })

      if (apiDismissed) {
        // Wait for the CMP to process the consent and hide the banner
        await page.waitForTimeout(1500)

        // Verify the banner is actually gone by checking for common CMP overlay elements
        const stillVisible = await page.evaluate(() => {
          // Check if Usercentrics banner is still showing
          const ucRoot = document.querySelector('#usercentrics-root')
          if (ucRoot?.shadowRoot) {
            const banner = ucRoot.shadowRoot.querySelector('[data-testid="uc-banner-modal"], [data-testid="uc-center-container"]')
            if (banner) {
              const rect = (banner as HTMLElement).getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) return true
            }
          }
          // Check generic consent overlays
          const overlays = document.querySelectorAll('[class*="consent" i], [class*="cookie-banner" i], [id*="consent" i]')
          for (const overlay of overlays) {
            const style = window.getComputedStyle(overlay)
            const rect = overlay.getBoundingClientRect()
            if (rect.width > 100 && rect.height > 100 && style.display !== 'none' && style.visibility !== 'hidden') {
              return true
            }
          }
          return false
        }).catch(() => false)

        if (!stillVisible) return true

        // Banner still visible — retry after a short wait
        if (attempt < 2) {
          await page.waitForTimeout(1000)
          continue
        }
        // Final attempt failed via API, fall through to DOM strategies
      }
    } catch { /* no CMP API found */ }

    // If first attempt found no API at all, wait before retrying (CMP may still be loading)
    if (attempt < 2) {
      await page.waitForTimeout(1000)
    }
  }

  // Strategy 1: Shadow DOM piercing — Usercentrics, Cookiebot, etc.
  // Many German CMPs render inside shadow DOMs. page.locator() can't pierce them,
  // but page.evaluate() can traverse shadow roots manually.
  try {
    const dismissed = await page.evaluate(() => {
      // Helper: recursively find elements across shadow DOMs
      function queryShadow(root: Document | ShadowRoot | Element, selector: string): Element[] {
        const results: Element[] = []
        const direct = root.querySelectorAll(selector)
        results.push(...direct)
        // Traverse shadow roots
        const allEls = root.querySelectorAll('*')
        for (const el of allEls) {
          if (el.shadowRoot) {
            results.push(...queryShadow(el.shadowRoot, selector))
          }
        }
        return results
      }

      // Find all buttons/links including those inside shadow DOMs
      const allButtons = queryShadow(document, 'button, a, [role="button"]')

      // Score each button
      let bestButton: Element | null = null
      let bestScore = 0

      for (const btn of allButtons) {
        const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
        if (!text || text.length > 80) continue

        // Skip settings/reject buttons
        if (/settings|einstellung|manage|verwalten|reject|ablehnen|impressum|datenschutz/i.test(text)) continue
        // Skip if "nur essentielle" (that's the reject-ish option)
        if (/nur\s+essentiell/i.test(text)) continue

        let score = 0

        // Strong signal: contains accept-like keywords
        if (/akzeptieren|accept|agree|zustimmen|erlauben|allow|annehmen/i.test(text)) score += 20
        if (/fortfahren|continue|weiter|got\s*it/i.test(text)) score += 5
        if (/all/i.test(text)) score += 3

        // Check if it looks like a primary button (colored background)
        const style = window.getComputedStyle(btn)
        const bg = style.backgroundColor
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' &&
            bg !== 'rgb(255, 255, 255)' && bg !== 'rgb(0, 0, 0)') {
          score += 10
        }
        if (parseInt(style.fontWeight || '400') >= 600) score += 2

        // Check if it's inside a consent-related container
        const path = btn.closest('[class*="consent" i], [class*="cookie" i], [class*="gdpr" i], [class*="privacy" i], [id*="consent" i], [id*="cookie" i], [id*="usercentrics" i]')
        if (path) score += 10

        // Check visibility
        const rect = btn.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue

        if (score > bestScore) {
          bestScore = score
          bestButton = btn
        }
      }

      if (bestButton && bestScore >= 20) {
        (bestButton as HTMLElement).click()
        return true
      }
      return false
    })

    if (dismissed) {
      await page.waitForTimeout(800)
      return true
    }
  } catch { /* evaluate failed */ }

  // Strategy 2: Known CSS selectors (fast path for common CMPs)
  for (const selector of COOKIE_BUTTON_SELECTORS) {
    try {
      const el = await page.$(selector)
      if (el && await el.isVisible()) {
        await el.click()
        await page.waitForTimeout(500)
        return true
      }
    } catch { /* selector didn't match */ }
  }

  // Strategy 3: Playwright text locators (for standard DOM elements)
  for (const text of COOKIE_ACCEPT_TEXTS) {
    try {
      const btn = page.getByRole('button', { name: text, exact: false })
      if (await btn.isVisible({ timeout: 100 }).catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(500)
        return true
      }
    } catch { /* not found */ }
    try {
      const link = page.getByRole('link', { name: text, exact: false })
      if (await link.isVisible({ timeout: 100 }).catch(() => false)) {
        await link.click()
        await page.waitForTimeout(500)
        return true
      }
    } catch { /* not found */ }
  }

  // Strategy 4: Check iframes (some CMPs render in iframes)
  try {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue
      const frameUrl = frame.url()
      if (!frameUrl.includes('consent') && !frameUrl.includes('cookie') && !frameUrl.includes('gdpr')) continue

      for (const text of COOKIE_ACCEPT_TEXTS) {
        try {
          const btn = frame.getByRole('button', { name: text, exact: false })
          if (await btn.isVisible({ timeout: 100 }).catch(() => false)) {
            await btn.click()
            await page.waitForTimeout(500)
            return true
          }
        } catch { /* not found */ }
      }
    }
  } catch { /* iframe access failed */ }

  return false
}
