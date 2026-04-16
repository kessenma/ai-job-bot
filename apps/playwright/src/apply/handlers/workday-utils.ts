import type { Page, Locator } from 'playwright'

/** Check if a selector exists on the page within a timeout */
export async function selectorExists(page: Page, selector: string, timeout = 1000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout })
    return true
  } catch {
    return false
  }
}

/**
 * Try to interact with an optional selector. If the element isn't found within
 * the timeout, log a warning and return false instead of throwing.
 */
export async function withOptSelector(
  page: Page,
  selector: string,
  callback: (el: Locator) => Promise<void>,
  searchTimeout = 2000,
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: searchTimeout })
    const el = page.locator(selector)
    await callback(el)
    return true
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      console.warn(`[workday] Selector not found: ${selector}`)
      return false
    }
    throw err
  }
}

/** Workday dropdown: click button → type value → press Enter */
export async function selectWorkdayDropdown(
  page: Page,
  selector: string,
  value: string,
): Promise<boolean> {
  return withOptSelector(page, selector, async (el) => {
    await el.click()
    await page.keyboard.type(value, { delay: 100 })
    await page.keyboard.press('Enter')
  })
}

/** Fill a Workday date field (month + year) within a container */
export async function fillWorkdayDateField(
  page: Page,
  containerSelector: string,
  month: string,
  year: string,
): Promise<boolean> {
  const monthSel = `${containerSelector} input[data-automation-id="dateSectionMonth-input"]`
  const yearSel = `${containerSelector} input[data-automation-id="dateSectionYear-input"]`

  let filled = false

  if (await selectorExists(page, monthSel)) {
    const monthEl = await page.$(monthSel)
    if (monthEl) {
      await monthEl.focus()
      await page.keyboard.type(month, { delay: 100 })
      filled = true
    }
  }

  if (await selectorExists(page, yearSel)) {
    const yearEl = await page.$(yearSel)
    if (yearEl) {
      await yearEl.focus()
      await page.keyboard.type(year, { delay: 100 })
      filled = true
    }
  }

  return filled
}

/** Small delay for Workday SPA renders */
export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
