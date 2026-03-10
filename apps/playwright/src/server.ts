import { Hono } from 'hono'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { getHandler } from './handlers/index.ts'
import type { ApplyProfile, ApplyResult } from './handlers/base.ts'
import { detectCaptcha } from './handlers/base.ts'

const app = new Hono()
let browser: Browser | null = null

// --- Cookie consent auto-dismissal ---

const COOKIE_BUTTON_SELECTORS = [
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

async function dismissCookieConsent(page: Page): Promise<boolean> {
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

// --- Find and click "Apply" button (EN/DE) ---

const APPLY_BUTTON_TEXT_PATTERNS = [
  // English
  /^apply(\s+now)?$/i,
  /^apply\s+(for\s+)?(this\s+)?(job|position|role)$/i,
  /^submit\s+(my\s+)?application$/i,
  /^apply\s+here$/i,
  /^quick\s+apply$/i,
  /^easy\s+apply$/i,
  // German
  /^(jetzt\s+)?bewerben$/i,
  /^(online\s+)?bewerben$/i,
  /^bewerbung\s+(einreichen|absenden|starten)$/i,
  /^jetzt\s+bewerben$/i,
  /^hier\s+bewerben$/i,
  /^schnellbewerbung$/i,
  /^direkt\s+bewerben$/i,
  /^stelle\s+bewerben$/i,
]

const APPLY_LINK_HREF_PATTERNS = [
  /\/apply/i,
  /\/bewerben/i,
  /\/bewerbung/i,
  /\/application/i,
]

async function findAndClickApply(page: Page): Promise<{ clicked: boolean; buttonText: string | null }> {
  // Strategy 1: Find buttons/links by text
  try {
    const clickables = await page.$$('button, a, [role="button"], input[type="submit"]')
    for (const el of clickables) {
      const text = (await el.textContent())?.trim() ?? ''
      if (!text || text.length > 60) continue
      const isVisible = await el.isVisible().catch(() => false)
      if (!isVisible) continue

      for (const pattern of APPLY_BUTTON_TEXT_PATTERNS) {
        if (pattern.test(text)) {
          await el.click()
          // Wait for navigation or modal to appear
          await page.waitForTimeout(2000)
          try {
            await page.waitForLoadState('domcontentloaded', { timeout: 5000 })
          } catch { /* might not navigate */ }
          return { clicked: true, buttonText: text }
        }
      }
    }
  } catch { /* no matching buttons */ }

  // Strategy 2: Find links by href containing /apply or /bewerben
  try {
    const links = await page.$$('a[href]')
    for (const link of links) {
      const href = await link.getAttribute('href')
      if (!href) continue
      const isVisible = await link.isVisible().catch(() => false)
      if (!isVisible) continue

      for (const pattern of APPLY_LINK_HREF_PATTERNS) {
        if (pattern.test(href)) {
          const text = (await link.textContent())?.trim() ?? href
          await link.click()
          await page.waitForTimeout(2000)
          try {
            await page.waitForLoadState('domcontentloaded', { timeout: 5000 })
          } catch { /* might not navigate */ }
          return { clicked: true, buttonText: text }
        }
      }
    }
  } catch { /* no matching links */ }

  return { clicked: false, buttonText: null }
}

// --- Smart form filler: match labels to profile fields, handle text + dropdowns ---

interface FormProfile {
  firstName: string
  lastName: string
  email: string
  phone?: string
  linkedinUrl?: string
  city?: string
  state?: string
  country?: string
  zipCode?: string
  currentLocation?: string // combined "City, Country" for free-text location fields
  salaryExpectations?: string
  availability?: string
  earliestStartDate?: string
  workVisaStatus?: string
  nationality?: string
  gender?: string
  referralSource?: string
  resumePath?: string
  coverLetterPath?: string
}

// Maps label keywords (EN/DE) to profile field names
const LABEL_TO_FIELD: [RegExp, keyof FormProfile][] = [
  // Name fields
  [/\b(first\s*name|vorname|given\s*name)\b/i, 'firstName'],
  [/\b(last\s*name|nachname|surname|family\s*name|familienname)\b/i, 'lastName'],
  // Contact
  [/\b(e[\s-]*mail|email)\b/i, 'email'],
  [/\b(phone|telefon|tel\.?|handy|mobil|mobile)\b/i, 'phone'],
  [/\b(linkedin)\b/i, 'linkedinUrl'],
  // Location — specific fields first, then generic fallback
  [/\b(zip\s*code|postal\s*code|plz|postleitzahl)\b/i, 'zipCode'],
  [/\b(state|province|bundesland|region)\b/i, 'state'],
  [/\b(country|land)\b/i, 'country'],
  [/\b(city|stadt|ort)\b(?!.*country)/i, 'city'],
  [/\b(where.*based|current.*location|standort|wohnort|location)\b/i, 'currentLocation'],
  // Salary
  [/\b(salary|gehalt|gehaltsvorstellung|compensation|vergütung)\b/i, 'salaryExpectations'],
  // Availability & start date
  [/\b(earliest.*start|start\s*date|eintrittsdatum|frühest|starttermin|when.*start)\b/i, 'earliestStartDate'],
  [/\b(availability|verfügbar|notice\s*period|kündigungsfrist)\b/i, 'availability'],
  // Visa & nationality
  [/\b(nationality|staatsangehörigkeit|staatsbürgerschaft|citizenship)\b/i, 'nationality'],
  [/\b(visa|work\s*permit|blue\s*card|aufenthalt|arbeitserlaubnis|arbeitsvisum)\b/i, 'workVisaStatus'],
  // Gender
  [/\b(gender|geschlecht|i\s+identify)\b/i, 'gender'],
  // Referral
  [/\b(hear\s*about|how.*find|quelle|erfahren|woher|source|referral)\b/i, 'referralSource'],
]

interface FilledField {
  label: string
  field: string
  value: string
  type: 'text' | 'select' | 'file' | 'checkbox'
}

async function fillForm(page: Page, profile: FormProfile): Promise<{ filled: FilledField[]; skipped: string[] }> {
  const filled: FilledField[] = []
  const skipped: string[] = []

  // Collect all form fields with their labels
  const fields = await page.evaluate(() => {
    const results: {
      type: 'text' | 'textarea' | 'select' | 'file' | 'checkbox'
      label: string
      id: string | null
      name: string | null
      required: boolean
      index: number
    }[] = []

    const inputs = document.querySelectorAll('input, textarea, select')
    inputs.forEach((el, index) => {
      const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      const type = el.tagName === 'SELECT' ? 'select' :
        el.tagName === 'TEXTAREA' ? 'textarea' :
        (input as HTMLInputElement).type === 'file' ? 'file' :
        (input as HTMLInputElement).type === 'checkbox' ? 'checkbox' :
        (input as HTMLInputElement).type === 'hidden' ? null : 'text'
      if (!type) return

      // Find label text
      let label = ''
      const id = input.id
      if (id) {
        const labelEl = document.querySelector(`label[for="${id}"]`)
        if (labelEl) label = (labelEl.textContent || '').replace(/\s+/g, ' ').trim()
      }
      if (!label) {
        // Check parent label
        const parentLabel = input.closest('label')
        if (parentLabel) label = (parentLabel.textContent || '').replace(/\s+/g, ' ').trim()
      }
      if (!label) {
        // Check aria-label
        label = input.getAttribute('aria-label') || ''
      }
      if (!label) {
        // Check placeholder
        label = (input as HTMLInputElement).placeholder || ''
      }
      if (!label) {
        // Check preceding sibling text or nearby label-like element
        const prev = input.previousElementSibling
        if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV')) {
          label = (prev.textContent || '').replace(/\s+/g, ' ').trim()
        }
      }

      results.push({
        type: type as any,
        label,
        id: id || null,
        name: input.name || null,
        required: input.required || input.getAttribute('aria-required') === 'true',
        index,
      })
    })

    return results
  })

  // Match each field to a profile value
  for (const field of fields) {
    if (field.type === 'file') continue // Handle files separately
    if (field.type === 'checkbox') continue // Handle consent separately
    if (!field.label) {
      if (field.required) skipped.push(field.name || field.id || `field_${field.index}`)
      continue
    }

    let matchedField: keyof FormProfile | null = null
    for (const [pattern, profileField] of LABEL_TO_FIELD) {
      if (pattern.test(field.label)) {
        matchedField = profileField
        break
      }
    }

    if (!matchedField || !profile[matchedField]) {
      if (field.required) skipped.push(field.label)
      continue
    }

    const value = profile[matchedField] as string
    const selector = field.id ? `#${CSS.escape(field.id)}` :
      field.name ? `[name="${field.name}"]` :
      `input:nth-of-type(${field.index + 1})`

    try {
      if (field.type === 'select') {
        // For dropdowns: find the best matching option
        const selected = await selectBestOption(page, selector, value)
        if (selected) {
          filled.push({ label: field.label, field: matchedField, value: selected, type: 'select' })
        } else {
          skipped.push(field.label)
        }
      } else {
        // Text input or textarea
        const el = field.id ? page.locator(`#${CSS.escape(field.id)}`) :
          field.name ? page.locator(`[name="${field.name}"]`) : null
        if (el) {
          await el.click()
          await el.fill(value)
          filled.push({ label: field.label, field: matchedField, value, type: 'text' })
        }
      }
    } catch {
      skipped.push(field.label)
    }
  }

  // Handle file uploads (resume + cover letter)
  if (profile.resumePath) {
    try {
      const fileInputs = await page.$$('input[type="file"]')
      for (const input of fileInputs) {
        const label = await page.evaluate((el) => {
          const id = el.id
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`)
            if (lbl) return (lbl.textContent || '').trim()
          }
          const parent = el.closest('div, section, fieldset')
          return parent ? (parent.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100) : ''
        }, input)

        if (/resume|cv|lebenslauf/i.test(label)) {
          await input.setInputFiles(profile.resumePath)
          filled.push({ label, field: 'resumePath', value: profile.resumePath, type: 'file' })
          break
        }
      }
    } catch { /* file upload failed */ }
  }

  if (profile.coverLetterPath) {
    try {
      const fileInputs = await page.$$('input[type="file"]')
      for (const input of fileInputs) {
        const label = await page.evaluate((el) => {
          const id = el.id
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`)
            if (lbl) return (lbl.textContent || '').trim()
          }
          const parent = el.closest('div, section, fieldset')
          return parent ? (parent.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100) : ''
        }, input)

        if (/cover\s*letter|anschreiben|motivationsschreiben/i.test(label)) {
          await input.setInputFiles(profile.coverLetterPath)
          filled.push({ label, field: 'coverLetterPath', value: profile.coverLetterPath, type: 'file' })
          break
        }
      }
    } catch { /* file upload failed */ }
  }

  // Handle consent/privacy checkboxes (auto-check)
  try {
    const checkboxes = await page.$$('input[type="checkbox"]')
    for (const cb of checkboxes) {
      const isChecked = await cb.isChecked()
      if (isChecked) continue

      const label = await page.evaluate((el) => {
        const id = el.id
        if (id) {
          const lbl = document.querySelector(`label[for="${id}"]`)
          if (lbl) return (lbl.textContent || '').replace(/\s+/g, ' ').trim()
        }
        const parent = el.closest('label')
        if (parent) return (parent.textContent || '').replace(/\s+/g, ' ').trim()
        return ''
      }, cb)

      // Only auto-check privacy/consent/data processing checkboxes
      if (/privacy|datenschutz|consent|einwillig|agree|zustimm|application.*process/i.test(label)) {
        await cb.check()
        filled.push({ label: label.slice(0, 80), field: 'consent', value: 'checked', type: 'checkbox' })
      }
    }
  } catch { /* checkbox handling failed */ }

  return { filled, skipped }
}

// Synonym groups: when the user's stored value is X, also try matching these alternatives
// Synonym groups: when the user's stored value is X, also try matching these alternatives
const DROPDOWN_SYNONYMS: Record<string, string[]> = {
  // Availability / notice period
  'immediately': ['sofort', 'ab sofort', 'right away', 'asap', 'now', 'as soon as possible'],
  '2 weeks': ['2 wochen', '14 days', '14 tage', 'two weeks', 'zwei wochen'],
  '1 month': ['1 monat', '4 weeks', '30 days', 'one month', 'ein monat'],
  '2 months': ['2 monate', 'two months', 'zwei monate'],
  '3 months': ['3 monate', 'three months', 'drei monate', '90 days'],
  '6 months': ['6 monate', 'six months', 'sechs monate'],

  // Work visa — expanded for US citizen applying to DE/AT jobs
  'no - will need sponsorship': ['no', 'nein', 'no i don\'t', 'need sponsorship', 'benötige visum',
    'not yet', 'noch nicht', 'will need', 'require sponsorship', 'require visa',
    'no work permit', 'keine arbeitserlaubnis'],
  'yes - have work visa': ['yes', 'ja', 'yes i do', 'i have', 'authorized', 'berechtigt',
    'have work permit', 'have visa', 'habe visum', 'habe arbeitserlaubnis'],
  'yes - blue card': ['blue card', 'blaue karte', 'blue card holder'],
  'yes - eu citizen': ['eu citizen', 'eu bürger', 'european citizen', 'eu national', 'eu/eea', 'eu/ewr'],
  'in process': ['in bearbeitung', 'pending', 'applied', 'beantragt', 'in progress'],
  'not required': ['nicht erforderlich', 'not needed', 'not applicable'],

  // Nationality
  'us citizen': ['american', 'united states', 'usa', 'us', 'amerikanisch'],
  'german': ['deutsch', 'germany', 'deutschland'],
  'austrian': ['österreichisch', 'austria', 'österreich'],

  // Gender
  'male': ['männlich', 'man', 'herr', 'm'],
  'female': ['weiblich', 'woman', 'frau', 'w', 'f'],
  'non-binary': ['nicht-binär', 'divers', 'other', 'sonstiges', 'andere'],
  'prefer not to say': ['keine angabe', 'not specified', 'not disclosed', 'rather not say',
    'möchte ich nicht angeben'],

  // Referral source
  'linkedin': ['social media', 'soziale medien'],
  'indeed': ['job board', 'jobbörse', 'stellenbörse'],
  'glassdoor': ['review site', 'bewertungsportal'],
  'company website': ['karriereseite', 'career page', 'website', 'webseite'],
  'job board': ['stellenportal', 'jobbörse', 'stepstone', 'xing'],
  'recruiter': ['headhunter', 'personalberater', 'staffing agency', 'personalvermittlung'],
  'friend / referral': ['empfehlung', 'friend', 'referral', 'freund', 'bekannter', 'employee referral'],
}

async function selectBestOption(page: Page, selector: string, desiredValue: string): Promise<string | null> {
  try {
    const options = await page.evaluate((sel) => {
      const select = document.querySelector(sel) as HTMLSelectElement
      if (!select) return []
      return Array.from(select.options).map((opt) => ({
        value: opt.value,
        text: opt.textContent?.trim() || '',
      }))
    }, selector)

    if (options.length === 0) return null

    const desired = desiredValue.toLowerCase()

    // Build a list of all terms to match against (desired value + its synonyms)
    const matchTerms = [desired, ...(DROPDOWN_SYNONYMS[desired] ?? [])]

    // Try exact match first
    for (const term of matchTerms) {
      for (const opt of options) {
        const text = opt.text.toLowerCase()
        if (text === term || opt.value.toLowerCase() === term) {
          await page.selectOption(selector, opt.value)
          return opt.text
        }
      }
    }

    // Try substring match (both directions)
    for (const term of matchTerms) {
      for (const opt of options) {
        const text = opt.text.toLowerCase()
        if (text.includes(term) || term.includes(text)) {
          // Skip placeholder-like options
          if (!opt.value || opt.text === '' || opt.text === '—' || opt.text === '--') continue
          await page.selectOption(selector, opt.value)
          return opt.text
        }
      }
    }

    // Try keyword overlap scoring across all synonyms
    const allWords = matchTerms.flatMap((t) => t.split(/\W+/).filter(Boolean))
    let bestMatch = { score: 0, option: null as typeof options[0] | null }
    for (const opt of options) {
      if (!opt.value || opt.text === '' || opt.text === '—' || opt.text === '--') continue
      const text = opt.text.toLowerCase()
      const words = text.split(/\W+/).filter(Boolean)
      let score = 0
      for (const w of allWords) {
        if (words.some((ow) => ow.includes(w) || w.includes(ow))) score++
      }
      if (score > bestMatch.score) {
        bestMatch = { score, option: opt }
      }
    }

    if (bestMatch.option && bestMatch.score > 0) {
      await page.selectOption(selector, bestMatch.option.value)
      return bestMatch.option.text
    }

    return null
  } catch {
    return null
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true })
  }
  return browser
}

app.get('/health', (c) => c.json({ status: 'ok' }))

app.post('/apply', async (c) => {
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

// --- Probe endpoint: visit URLs and check page status + captcha ---

interface RawProbeResult {
  url: string
  status: 'loaded' | 'blocked' | 'expired' | 'error'
  httpStatus: number | null
  hasCaptcha: boolean
  title: string | null
  errorMessage: string | null
  probeTimeMs: number
}

const EXPIRED_PATTERNS = [
  /position.*(?:filled|closed|expired|no longer)/i,
  /no longer accepting/i,
  /job.*(?:not found|unavailable|removed)/i,
  /this page (?:does not exist|cannot be found)/i,
]

const BLOCKED_PATTERNS = [
  /access denied/i,
  /please verify/i,
  /checking your browser/i,
]

async function probeUrl(context: BrowserContext, url: string): Promise<RawProbeResult> {
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

app.post('/probe', async (c) => {
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
    const results: RawProbeResult[] = []
    for (const url of urls) {
      results.push(await probeUrl(context, url))
    }
    return c.json({ results, totalTimeMs: Date.now() - start })
  } finally {
    await context.close()
  }
})

// --- Screenshot endpoint: visit a URL, take a screenshot, return base64 ---

app.post('/screenshot', async (c) => {
  const body = await c.req.json<{ url: string }>()
  const { url } = body

  if (!url) {
    return c.json({ error: 'url is required' }, 400)
  }

  const start = Date.now()
  const b = await getBrowser()
  const context = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })

    const httpStatus = response?.status() ?? null
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

    const hasCaptcha = await detectCaptcha(page)

    // Dismiss cookie consent banners before screenshot
    const dismissedCookies = await dismissCookieConsent(page)

    // Try to find and click an "Apply" button (EN/DE)
    const applyResult = await findAndClickApply(page)

    // If we navigated to an apply page, dismiss cookies again (new page may have its own banner)
    if (applyResult.clicked) {
      await dismissCookieConsent(page)
    }

    // Wait a bit for images/styles to load before screenshot
    await page.waitForTimeout(1000)

    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false })
    const screenshot = screenshotBuffer.toString('base64')

    // Get updated title/URL after any navigation
    const finalTitle = await page.title().catch(() => title)
    const finalUrl = page.url()

    return c.json({
      screenshot,
      title: finalTitle,
      status,
      hasCaptcha,
      httpStatus,
      timeMs: Date.now() - start,
      actions: {
        dismissedCookies,
        clickedApply: applyResult.clicked,
        applyButtonText: applyResult.buttonText,
        navigatedTo: applyResult.clicked ? finalUrl : null,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  } finally {
    await context.close()
  }
})

// --- Scrape job description text from a URL ---

const JOB_DESCRIPTION_SELECTORS = [
  // ATS-specific selectors (most reliable)
  '.posting-page',
  '[data-testid="job-description"]',
  '.job-description',
  '#job-description',
  '.job-details',
  '.posting-description',
  '[class*="jobDescription"]',
  '[class*="job-posting"]',
  // Recruitee
  '.career-page-description',
  '.custom-css-style-job-widget-description',
  // Greenhouse
  '#content',
  '.job__description',
  // Lever
  '.posting-page .content',
  // Ashby
  '[class*="ashby-job-posting"]',
  // Personio
  '.job-posting',
  // Join
  '.job-ad-display',
  // Generic fallbacks
  'article',
  'main',
  '[role="main"]',
]

app.post('/scrape-description', async (c) => {
  const body = await c.req.json<{ url: string }>()
  const { url } = body

  if (!url) {
    return c.json({ error: 'url is required' }, 400)
  }

  const start = Date.now()
  const b = await getBrowser()
  const context = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })

    const title = await page.title().catch(() => null)

    // Dismiss cookie consent banners
    await dismissCookieConsent(page)

    // Wait for dynamic content to render
    await page.waitForTimeout(1500)

    // Try selectors in priority order, using innerText to preserve line breaks
    // from block elements (<p>, <div>, <li>, <h2>, etc.)
    let text: string | null = null
    for (const selector of JOB_DESCRIPTION_SELECTORS) {
      try {
        const content = await page.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return null
          return (el as HTMLElement).innerText
        }, selector)
        if (content && content.trim().length > 100) {
          text = content.trim()
          break
        }
      } catch { /* selector didn't match */ }
    }

    // Fallback: body innerText
    if (!text) {
      text = await page.evaluate(() => document.body?.innerText ?? null).catch(() => null)
    }

    // Clean up whitespace: normalize spaces within lines, collapse excessive blank lines
    if (text) {
      text = text
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    return c.json({
      text: text ?? '',
      title,
      url: page.url(),
      timeMs: Date.now() - start,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  } finally {
    await context.close()
  }
})

// --- Fill form endpoint: navigate, dismiss cookies, click apply, fill form fields ---

app.post('/fill-form', async (c) => {
  const body = await c.req.json<{ url: string; profile: FormProfile }>()
  const { url, profile } = body

  if (!url || !profile) {
    return c.json({ error: 'url and profile are required' }, 400)
  }

  const start = Date.now()
  const b = await getBrowser()
  const context = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Dismiss cookies
    const dismissedCookies = await dismissCookieConsent(page)

    // Click apply button if on a job listing page
    const applyResult = await findAndClickApply(page)

    if (applyResult.clicked) {
      await dismissCookieConsent(page)
    }

    // Wait for form to fully render
    await page.waitForTimeout(1500)

    // Fill the form
    const { filled, skipped } = await fillForm(page, profile)

    // Take a screenshot showing the filled form
    await page.waitForTimeout(500)
    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false })
    const screenshot = screenshotBuffer.toString('base64')
    const title = await page.title().catch(() => null)
    const finalUrl = page.url()

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
      timeMs: Date.now() - start,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  } finally {
    await context.close()
  }
})

// --- LinkedIn Job Search ---

import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const LINKEDIN_DATA_DIR = resolve(process.env.DATA_DIR || './data', 'linkedin-profile')
mkdirSync(LINKEDIN_DATA_DIR, { recursive: true })

let linkedInContext: BrowserContext | null = null
let linkedInLastLoginAt = 0 // timestamp of last successful login

async function getLinkedInContext(): Promise<BrowserContext> {
  if (linkedInContext) {
    try {
      // Check if still alive by accessing pages
      linkedInContext.pages()
      return linkedInContext
    } catch {
      console.log('LinkedIn: Persistent context died, recreating...')
      linkedInContext = null
      linkedInLastLoginAt = 0
    }
  }
  console.log('LinkedIn: Creating persistent context at', LINKEDIN_DATA_DIR)
  linkedInContext = await chromium.launchPersistentContext(LINKEDIN_DATA_DIR, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  return linkedInContext
}

// Consider login valid for 30 minutes
function isLoginRecent(): boolean {
  return linkedInLastLoginAt > 0 && (Date.now() - linkedInLastLoginAt) < 30 * 60 * 1000
}

function randomDelay(minMs = 1000, maxMs = 3000): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs)
  return new Promise((r) => setTimeout(r, ms))
}

async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector)
  await randomDelay(200, 500)
  await page.type(selector, text, { delay: 50 + Math.floor(Math.random() * 100) })
}

async function waitForLinkedInLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('load')
  await randomDelay(2000, 4000)
}

async function isLinkedInLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await randomDelay(1000, 2000)
    const title = await page.title()
    const url = page.url()
    console.log('LinkedIn: Login check - URL:', url, 'Title:', title)

    // Direct indicators
    if (isLoggedInByTitle(title) || url.includes('/feed')) return true

    // Check for global nav (present on all authenticated pages)
    const hasGlobalNav = await page.evaluate(() => {
      return !!document.querySelector('#global-nav, .global-nav, [data-test-global-nav]')
    }).catch(() => false)
    if (hasGlobalNav) {
      console.log('LinkedIn: Logged in (global nav detected)')
      return true
    }

    // If redirected to login/authwall, definitely not logged in
    if (url.includes('/login') || url.includes('/authwall')) {
      console.log('LinkedIn: Not logged in (redirected to login)')
      return false
    }

    return false
  } catch {
    return false
  }
}

type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'credentials' | 'captcha' | 'verification_pending' | 'error'; message: string }

function isOnVerificationPage(url: string, content: string): boolean {
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

function isLoggedInByTitle(title: string): boolean {
  const t = title.toLowerCase()
  // Only "Feed" or "(N) Feed" is a reliable indicator of being logged in
  // Other pages like job search can load without auth
  return t.includes('feed') || t.includes('home')
}

async function linkedInLogin(page: Page, email: string, password: string, waitForVerification = false): Promise<LoginResult> {
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await waitForLinkedInLoad(page)

  await humanType(page, '#username', email)
  await randomDelay(500, 1000)
  await humanType(page, '#password', password)
  await randomDelay(500, 1000)

  await page.click('button[type=submit]')
  await page.waitForLoadState('load', { timeout: 15000 })
  await randomDelay(2000, 4000)

  // Check where we landed after login
  const title = await page.title()
  const currentUrl = page.url()
  console.log('LinkedIn login: After submit - URL:', currentUrl, 'Title:', title)

  // Check if we landed on a logged-in page (feed, home, or any authenticated page)
  if (isLoggedInByTitle(title) || currentUrl.includes('/feed') || currentUrl.includes('/mynetwork') || currentUrl.includes('/in/')) {
    console.log('LinkedIn login: Success (no 2FA needed)')
    return { ok: true }
  }

  // For new accounts, LinkedIn may redirect to onboarding/welcome pages
  if (currentUrl.includes('/onboarding') || currentUrl.includes('/start') || currentUrl.includes('/welcome')) {
    console.log('LinkedIn login: Success (redirected to onboarding)')
    return { ok: true }
  }

  // Check for verification / checkpoint page
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

    // Poll: wait up to 60 seconds for user to approve on their phone
    console.log('LinkedIn: Waiting for push notification approval (up to 60s)...')
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      await randomDelay(3000, 5000)

      const nowUrl = page.url()
      const nowTitle = await page.title()

      // Check if we've been redirected to the feed
      if (isLoggedInByTitle(nowTitle) || nowUrl.includes('/feed')) {
        console.log('LinkedIn: Verification approved!')
        return { ok: true }
      }

      // Still on checkpoint page, keep waiting
      if (!isOnVerificationPage(nowUrl, await page.content())) {
        // We left the checkpoint but didn't reach feed — could be another step
        break
      }
    }

    // Timed out or navigated somewhere unexpected
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

  // Check for CAPTCHA
  const hasCaptchaIndicator = await page.evaluate(() => {
    return !!document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha-challenge')
  }).catch(() => false)
  if (hasCaptchaIndicator || currentUrl.includes('challenge/recaptcha')) {
    console.log('LinkedIn login: CAPTCHA detected')
    return { ok: false, reason: 'captcha', message: 'LinkedIn requires a CAPTCHA. Try running the Playwright server with headless=false.' }
  }

  // Check if maybe we ARE logged in but landed on an unexpected page
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

app.post('/linkedin-search', async (c) => {
  const linkedInEmail = process.env.LINKEDIN_EMAIL
  const linkedInPassword = process.env.LINKEDIN_PASSWORD

  if (!linkedInEmail || !linkedInPassword) {
    return c.json({
      status: 'auth_error',
      message: 'LINKEDIN_EMAIL and LINKEDIN_PASSWORD environment variables must be set on the Playwright server.',
    }, 400)
  }

  const body = await c.req.json<{ keywords: string; location: string; skills: string[]; maxResults?: number }>()
  const { keywords, location, skills, maxResults: requestedMax } = body

  if (!keywords?.trim()) {
    return c.json({ status: 'error', message: 'keywords is required' }, 400)
  }

  let page: Page | null = null

  try {
    const ctx = await getLinkedInContext()
    page = await ctx.newPage()

    // Skip login check if we logged in recently (avoids extra /feed/ navigation)
    if (isLoginRecent()) {
      console.log('LinkedIn: Login still valid (last login', Math.round((Date.now() - linkedInLastLoginAt) / 1000), 'seconds ago)')
    } else {
      console.log('LinkedIn: Checking login status...')
      const loggedIn = await isLinkedInLoggedIn(page)
      if (!loggedIn) {
        console.log('LinkedIn: Not logged in, attempting login...')
        const loginResult = await linkedInLogin(page, linkedInEmail, linkedInPassword)
        if (!loginResult.ok) {
          console.log('LinkedIn: Login failed -', loginResult.reason, loginResult.message)
          const statusMap = { credentials: 'auth_error', captcha: 'captcha_blocked', verification_pending: 'verification_pending', error: 'error' } as const
          return c.json({ status: statusMap[loginResult.reason], message: loginResult.message }, loginResult.reason === 'credentials' ? 401 : 403)
        }
        console.log('LinkedIn: Login successful')
        linkedInLastLoginAt = Date.now()
      } else {
        console.log('LinkedIn: Already logged in')
        linkedInLastLoginAt = Date.now()
      }
    }

    // Navigate to job search
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords.trim())}&location=${encodeURIComponent((location || '').trim())}&f_TPR=r86400&sortBy=DD`
    console.log('LinkedIn: Navigating to search URL:', searchUrl)
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForLinkedInLoad(page)

    // Check if we got redirected to login or verification page
    const postNavUrl = page.url()
    const postNavTitle = await page.title()
    console.log('LinkedIn: After navigation - URL:', postNavUrl, 'Title:', postNavTitle)

    // Check if we're on the public (unauthenticated) version of the search page
    // The authenticated page has nav elements like global-nav, the public one has jobs-search__results-list
    const isAuthenticatedPage = await page.evaluate(() => {
      return !!document.querySelector('#global-nav, .global-nav, [data-test-global-nav]')
    }).catch(() => false)
    console.log('LinkedIn: Authenticated page:', isAuthenticatedPage)

    if (!isAuthenticatedPage && !postNavUrl.includes('/login') && !postNavUrl.includes('/authwall')) {
      // We're on the public page — session didn't carry over. Try logging in.
      console.log('LinkedIn: On public/unauthenticated page, need to login...')
      linkedInLastLoginAt = 0
      const loginResult = await linkedInLogin(page, linkedInEmail, linkedInPassword)
      if (!loginResult.ok) {
        console.log('LinkedIn: Login failed -', loginResult.reason, '. Falling back to public page results.')
        // Fall through — we can still extract from the public page
      } else {
        console.log('LinkedIn: Login successful, retrying search...')
        linkedInLastLoginAt = Date.now()
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await waitForLinkedInLoad(page)
      }
    } else if (postNavUrl.includes('/login') || postNavUrl.includes('/authwall')) {
      console.log('LinkedIn: Session expired, redirected to login. Attempting re-login...')
      linkedInLastLoginAt = 0
      const loginResult = await linkedInLogin(page, linkedInEmail, linkedInPassword)
      if (!loginResult.ok) {
        console.log('LinkedIn: Re-login failed -', loginResult.reason)
        const statusMap = { credentials: 'auth_error', captcha: 'captcha_blocked', verification_pending: 'verification_pending', error: 'error' } as const
        return c.json({ status: statusMap[loginResult.reason], message: loginResult.message }, loginResult.reason === 'credentials' ? 401 : 403)
      }
      console.log('LinkedIn: Re-login successful, retrying search...')
      linkedInLastLoginAt = Date.now()
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await waitForLinkedInLoad(page)
    }

    if (isOnVerificationPage(page.url(), await page.content())) {
      console.log('LinkedIn: Hit verification page during search')
      linkedInLastLoginAt = 0
      const ss = await page.screenshot({ type: 'png', fullPage: false }).then((b) => b.toString('base64')).catch(() => '')
      return c.json({ status: 'captcha_blocked', message: 'LinkedIn requires security verification. Complete the login test first, then search.', screenshot: ss }, 403)
    }

    // Wait for job list to appear — try multiple selectors since LinkedIn updates their DOM
    const JOB_CARD_SELECTORS = [
      // Public/unauthenticated search page
      'ul.jobs-search__results-list > li',
      '.base-card',
      // Authenticated search page
      'div[data-job-id]',
      'li[data-occludable-job-id]',
      '.job-card-container',
      '.jobs-search-results__list-item',
      '[data-view-name="job-card"]',
      '.scaffold-layout__list-item',
    ]
    console.log('LinkedIn: Waiting for job cards to load...')
    let matchedCardSelector: string | null = null
    try {
      // Race all selectors — whichever appears first wins
      const selectorRace = JOB_CARD_SELECTORS.map((sel) =>
        page!.waitForSelector(sel, { timeout: 10000 }).then(() => sel)
      )
      matchedCardSelector = await Promise.any(selectorRace)
      console.log('LinkedIn: Job cards found with selector:', matchedCardSelector)
    } catch {
      // None of the selectors matched — dump page structure for debugging
      const currentUrl = page!.url()
      const debugInfo = await page!.evaluate(() => {
        // Check for actual captcha/challenge elements
        const hasCaptchaFrame = !!document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha-challenge')
        const hasCheckpoint = window.location.href.includes('/checkpoint/')
        // Find what list-like containers exist
        const lists = Array.from(document.querySelectorAll('[class*="job"], [class*="search-result"], [class*="scaffold"]'))
          .slice(0, 10)
          .map((el) => ({ tag: el.tagName, class: el.className.toString().slice(0, 100), children: el.children.length }))
        return { hasCaptchaFrame, hasCheckpoint, lists, title: document.title }
      }).catch(() => ({ hasCaptchaFrame: false, hasCheckpoint: false, lists: [], title: '' }))

      console.log('LinkedIn: No job cards found. URL:', currentUrl)
      console.log('LinkedIn: Debug info:', JSON.stringify(debugInfo, null, 2))

      const ss = await page!.screenshot({ type: 'png', fullPage: false }).then((b) => b.toString('base64')).catch(() => '')
      if (debugInfo.hasCaptchaFrame || debugInfo.hasCheckpoint) {
        console.log('LinkedIn: Actual captcha/checkpoint detected')
        return c.json({ status: 'captcha_blocked', message: 'LinkedIn is showing a captcha. Try again later.', screenshot: ss }, 403)
      }
      console.log('LinkedIn: No jobs matched the search criteria (or selectors need updating)')
      return c.json({ status: 'ok', results: [], screenshot: ss })
    }

    // Scroll to load more results
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const list = document.querySelector('.jobs-search__results-list') ||
          document.querySelector('.jobs-search-results-list') ||
          document.querySelector('.scaffold-layout__list')
        if (list) {
          list.scrollTop += 400
        } else {
          // Public page: scroll the window instead
          window.scrollBy(0, 400)
        }
      })
      await randomDelay(800, 1500)
    }

    // Extract job cards (max 5) using whichever selector matched
    const cards = await page.$$(matchedCardSelector!)
    const maxResults = Math.min(cards.length, requestedMax || 5)
    console.log(`LinkedIn: Found ${cards.length} job cards, extracting up to ${maxResults}`)

    const results: Array<{
      title: string
      company: string
      url: string
      externalUrl: string
      location: string
      matchedSkills: string[]
      missingSkills: string[]
      description: string
    }> = []

    for (let i = 0; i < maxResults; i++) {
      const card = cards[i]
      if (!card) continue

      try {
        // Extract basic info from the card — try multiple selector strategies
        const cardInfo = await card.evaluate((el) => {
          // Find the main link (title) — public page uses .base-card__full-link or .base-search-card--link
          const link = el.querySelector('a[href*="/jobs/view/"]') ||
            el.querySelector('a.base-card__full-link') ||
            el.querySelector('a.job-card-container__link') ||
            el.querySelector('a.job-card-list__title') ||
            el.querySelector('[class*="job-card"] a') ||
            el.querySelector('a[href*="/jobs/"]')
          // Title text — public page has it in h3.base-search-card__title
          const titleEl = el.querySelector('h3.base-search-card__title') ||
            el.querySelector('[class*="job-search-card__title"]') ||
            link
          const title = titleEl?.textContent?.trim() || ''
          const href = link?.getAttribute('href') || ''

          // Company name — public page uses h4.base-search-card__subtitle or .job-search-card__company-name
          const companyEl = el.querySelector('h4.base-search-card__subtitle') ||
            el.querySelector('.base-search-card__subtitle') ||
            el.querySelector('[class*="job-search-card__company"]') ||
            el.querySelector('.artdeco-entity-lockup__subtitle') ||
            el.querySelector('[class*="job-card-container__primary-description"]') ||
            el.querySelector('[class*="company"]')
          const company = companyEl?.textContent?.trim() || ''

          // Location — public page uses .job-search-card__location
          const locEl = el.querySelector('.job-search-card__location') ||
            el.querySelector('[class*="job-search-card__location"]') ||
            el.querySelector('.artdeco-entity-lockup__caption') ||
            el.querySelector('[class*="job-card-container__metadata-item"]')
          const location = locEl?.textContent?.trim() || ''

          return { title, href, company, location }
        }).catch(() => ({ title: '', href: '', company: '', location: '' }))

        const { title, company, location: jobLocation } = cardInfo
        const href = cardInfo.href

        if (!title || !href) continue

        const fullUrl = href.startsWith('http') ? href.split('?')[0] : `https://www.linkedin.com${href.split('?')[0]}`

        // Try to get description — method depends on whether we're on public or authenticated page
        let description = ''
        const isPublicPage = matchedCardSelector === 'ul.jobs-search__results-list > li' || matchedCardSelector === '.base-card'

        if (isPublicPage) {
          // Public page: description snippet is in the card itself or we skip it
          description = await card.evaluate((el) => {
            const desc = el.querySelector('.base-search-card__metadata, .job-search-card__snippet, [class*="snippet"]')
            return desc?.textContent?.trim() || ''
          }).catch(() => '')
        } else {
          // Authenticated page: click the card to load the detail pane
          await card.click()
          await randomDelay(1500, 2500)
          try {
            await page.waitForSelector('.jobs-description, .jobs-box__html-content, [class*="jobs-description"]', { timeout: 5000 })
            description = await page.$eval(
              '.jobs-description, .jobs-box__html-content, [class*="jobs-description"]',
              (el) => el.textContent?.trim() || '',
            )
          } catch {
            // Description pane didn't load, continue without it
          }
        }

        // Extract external apply URL from the detail pane
        let externalUrl = ''
        if (!isPublicPage) {
          try {
            // Look for the apply button — LinkedIn uses different variants
            const applyBtn = await page.$([
              'a.jobs-apply-button',
              'a[href*="externalApply"]',
              'a[data-job-id][href*="http"]',
              '.jobs-apply-button--top-card a',
              '.jobs-s-apply button',
            ].join(', '))
            if (applyBtn) {
              const applyHref = await applyBtn.getAttribute('href')
              if (applyHref && applyHref.startsWith('http') && !applyHref.includes('linkedin.com')) {
                externalUrl = applyHref.split('?')[0]
              }
            }
            // Fallback: look for external link in the job details section
            if (!externalUrl) {
              externalUrl = await page.evaluate(() => {
                // Check for "Apply on company website" link pattern
                const links = document.querySelectorAll('.jobs-apply-button, a[href*="externalApply"], .jobs-s-apply a, a.apply-button')
                for (const link of links) {
                  const href = link.getAttribute('href')
                  if (href && href.startsWith('http') && !href.includes('linkedin.com')) {
                    return href.split('?')[0]
                  }
                }
                // Check for redirect URL in onclick or data attributes
                const applySection = document.querySelector('.jobs-apply-button--top-card, .jobs-s-apply')
                if (applySection) {
                  const allLinks = applySection.querySelectorAll('a[href]')
                  for (const a of allLinks) {
                    const href = a.getAttribute('href') || ''
                    if (href.includes('externalApply') || (href.startsWith('http') && !href.includes('linkedin.com'))) {
                      // LinkedIn wraps external URLs — try to extract from redirect
                      const urlMatch = href.match(/url=([^&]+)/)
                      if (urlMatch) return decodeURIComponent(urlMatch[1]).split('?')[0]
                      if (!href.includes('linkedin.com')) return href.split('?')[0]
                    }
                  }
                }
                return ''
              }).catch(() => '')
            }
          } catch {
            // External URL extraction failed, continue without it
          }
        }
        if (externalUrl) {
          console.log(`LinkedIn: Card ${i + 1}/${maxResults}: External URL: ${externalUrl}`)
        }

        // Skills matching
        const combined = `${title} ${description}`.toLowerCase()
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

        console.log(`LinkedIn: Card ${i + 1}/${maxResults}: "${title}" at ${company} (${matchedSkills.length} skill matches)`)
        results.push({
          title,
          company,
          url: fullUrl,
          externalUrl,
          location: jobLocation,
          matchedSkills,
          missingSkills,
          description: description.slice(0, 500),
        })
      } catch (err) {
        console.error(`LinkedIn: Error extracting card ${i}:`, err)
        continue
      }
    }

    // Take a debug screenshot of the search results page
    let screenshot = ''
    try {
      const buf = await page.screenshot({ type: 'png', fullPage: false })
      screenshot = buf.toString('base64')
      console.log('LinkedIn: Screenshot captured')
    } catch (err) {
      console.log('LinkedIn: Screenshot failed:', err)
    }

    console.log(`LinkedIn: Search complete, returning ${results.length} results`)
    return c.json({ status: 'ok', results, screenshot })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('LinkedIn search error:', message)
    return c.json({ status: 'error', message }, 500)
  } finally {
    if (page) await page.close().catch(() => {})
  }
})

app.post('/linkedin-login-test', async (c) => {
  const linkedInEmail = process.env.LINKEDIN_EMAIL
  const linkedInPassword = process.env.LINKEDIN_PASSWORD

  if (!linkedInEmail || !linkedInPassword) {
    return c.json({
      status: 'not_configured',
      message: 'LINKEDIN_EMAIL and LINKEDIN_PASSWORD environment variables are not set.',
    })
  }

  // Optional: { waitForVerification: true } to poll for push notification approval
  const body = await c.req.json<{ waitForVerification?: boolean }>().catch(() => ({ waitForVerification: false }))
  const waitForVerification = body.waitForVerification ?? false

  let page: Page | null = null

  try {
    const ctx = await getLinkedInContext()
    page = await ctx.newPage()

    // Check if already logged in
    const loggedIn = await isLinkedInLoggedIn(page)
    if (loggedIn) {
      linkedInLastLoginAt = Date.now()
      console.log('LinkedIn test: Already logged in')
      return c.json({ status: 'connected', message: 'Already logged in to LinkedIn.' })
    }

    // Attempt login
    console.log('LinkedIn test: Attempting login...')
    const loginResult = await linkedInLogin(page, linkedInEmail, linkedInPassword, waitForVerification)
    if (loginResult.ok) {
      linkedInLastLoginAt = Date.now()
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
    return c.json({ status: statusMap[loginResult.reason], message: loginResult.message })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ status: 'error', message }, 500)
  } finally {
    if (page) await page.close().catch(() => {})
  }
})

app.get('/handlers', (c) => {
  const { handlers } = require('./handlers/index.ts')
  return c.json(handlers.map((h: { name: string }) => h.name))
})

const port = Number(process.env.PORT || 8084)
console.log(`Playwright service listening on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
