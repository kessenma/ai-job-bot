import type { Page } from 'playwright'

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

export async function findAndClickApply(page: Page): Promise<{ clicked: boolean; buttonText: string | null }> {
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
