/**
 * Annotate screenshots with visual indicators showing where Playwright
 * is about to click or has just interacted with an element.
 */

import type { Page, ElementHandle } from 'playwright'

interface OverlayOptions {
  label?: string
  /** 'target' = blue (about to click), 'active' = green (extracting/interacting) */
  variant?: 'target' | 'active'
}

const OVERLAY_ID = '__pw-click-overlay'

const COLORS = {
  target: { border: '#00bfff', fill: 'rgba(0, 191, 255, 0.12)', text: '#00bfff' },
  active: { border: '#22c55e', fill: 'rgba(34, 197, 94, 0.12)', text: '#22c55e' },
} as const

/**
 * Inject a visual overlay on the page at the element's bounding box.
 * Returns a cleanup function to remove it.
 */
export async function highlightElement(
  page: Page,
  target: ElementHandle | string,
  options: OverlayOptions = {},
): Promise<() => Promise<void>> {
  const { label, variant = 'target' } = options
  const colors = COLORS[variant]

  const element = typeof target === 'string' ? await page.$(target) : target
  if (!element) return async () => {}

  const box = await element.boundingBox()
  if (!box) return async () => {}

  await page.evaluate(
    ({ box, colors, label, overlayId }) => {
      // Remove any existing overlay
      document.getElementById(overlayId)?.remove()

      const overlay = document.createElement('div')
      overlay.id = overlayId
      overlay.style.cssText = `
        position: fixed;
        left: ${box.x}px;
        top: ${box.y}px;
        width: ${box.width}px;
        height: ${box.height}px;
        border: 3px solid ${colors.border};
        background: ${colors.fill};
        border-radius: 6px;
        pointer-events: none;
        z-index: 999999;
        box-sizing: border-box;
      `

      if (label) {
        const badge = document.createElement('div')
        badge.textContent = label
        badge.style.cssText = `
          position: absolute;
          top: -22px;
          left: -1px;
          background: ${colors.border};
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          font-family: system-ui, sans-serif;
          padding: 2px 8px;
          border-radius: 4px 4px 0 0;
          white-space: nowrap;
        `
        overlay.appendChild(badge)
      }

      document.body.appendChild(overlay)
    },
    { box, colors, label: label || null, overlayId: OVERLAY_ID },
  )

  return async () => {
    await page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY_ID).catch(() => {})
  }
}

/** Remove any existing overlay from the page */
export async function clearOverlay(page: Page): Promise<void> {
  await page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY_ID).catch(() => {})
}

/**
 * Highlight an element, take a JPEG screenshot, then remove the overlay.
 * Returns the screenshot as a base64 string.
 */
export async function highlightAndScreenshot(
  page: Page,
  target: ElementHandle | string,
  options: OverlayOptions = {},
): Promise<string> {
  const cleanup = await highlightElement(page, target, options)
  try {
    const buf = await page.screenshot({ type: 'jpeg', quality: 50 })
    return buf.toString('base64')
  } finally {
    await cleanup()
  }
}

/** Take a plain JPEG screenshot (no overlay) */
export async function takeScreenshot(page: Page): Promise<string> {
  const buf = await page.screenshot({ type: 'jpeg', quality: 50 })
  return buf.toString('base64')
}
