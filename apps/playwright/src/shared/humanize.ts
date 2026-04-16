import type { Page } from 'playwright'

/**
 * Beta-like distribution delay: biased toward shorter waits with occasional long pauses.
 * Formula: wait = min + (random^1.4) * (max - min)
 */
export function humanDelay(minMs = 1000, maxMs = 3000): Promise<void> {
  const skewed = Math.pow(Math.random(), 1.4)
  const ms = minMs + skewed * (maxMs - minMs)
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Type text character-by-character with human-like timing.
 * - Per-keystroke delay: ~60ms base + variance (triangular distribution)
 * - Occasional thinking pauses every 8-15 chars
 * - Falls back to fill() for text > 200 chars
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector)
  await humanDelay(200, 500)

  if (text.length > 200) {
    // For long text, just fill directly
    await page.fill(selector, text)
    return
  }

  const thinkEvery = 8 + Math.floor(Math.random() * 8) // pause every 8-15 chars

  for (let i = 0; i < text.length; i++) {
    // Per-keystroke delay: triangular distribution centered around 80ms
    const baseDelay = 60
    const variance = 80
    const delay = baseDelay + ((Math.random() + Math.random()) * variance) / 2

    await page.type(selector, text[i], { delay: 0 })
    await new Promise((r) => setTimeout(r, delay))

    // Occasional thinking pause
    if (i > 0 && i % thinkEvery === 0) {
      await humanDelay(200, 500)
    }
  }
}

/**
 * Click an element with natural mouse movement and slight randomized offset.
 */
export async function humanClick(page: Page, selector: string, options?: { timeout?: number }): Promise<void> {
  const el = page.locator(selector)
  await el.waitFor({ state: 'visible', timeout: options?.timeout ?? 10000 })

  const box = await el.boundingBox()
  if (!box) {
    // Fallback to normal click if no bounding box
    await el.click()
    return
  }

  // Random point within the element (not dead center)
  const x = box.x + box.width * (0.3 + Math.random() * 0.4)
  const y = box.y + box.height * (0.3 + Math.random() * 0.4)

  // Move mouse to target with smooth steps
  await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 6) })

  // Pre-click pause
  await humanDelay(100, 300)

  await page.mouse.click(x, y)

  // Post-click pause
  await humanDelay(200, 600)
}

/**
 * Scroll the page in smaller increments to appear more natural.
 */
export async function humanScroll(page: Page, totalPixels = 400): Promise<void> {
  const steps = 2 + Math.floor(Math.random() * 3) // 2-4 increments
  const perStep = totalPixels / steps

  for (let i = 0; i < steps; i++) {
    const amount = perStep * (0.7 + Math.random() * 0.6) // vary each scroll amount
    await page.evaluate((px) => window.scrollBy(0, px), amount)
    await humanDelay(200, 600)
  }
}

/**
 * Wait for page load with extra async rendering delay.
 */
export async function waitForFullLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('load')
  await humanDelay(2000, 4000)
}
