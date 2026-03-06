import type { Page } from 'playwright'
import type { ApplyProfile, ApplyResult } from '../types.ts'
import { type ATSHandler, detectCaptcha, fillField, uploadFile } from './base.ts'

export const recruiteeHandler: ATSHandler = {
  name: 'recruitee',

  canHandle(url: string) {
    return /recruitee\.com/.test(url)
  },

  async apply(page: Page, url: string, profile: ApplyProfile): Promise<ApplyResult> {
    await page.goto(url, { waitUntil: 'networkidle' })

    // Check if the job is still active
    const pageContent = await page.textContent('body')
    if (
      pageContent?.includes('no longer accepting') ||
      pageContent?.includes('position has been filled')
    ) {
      return { status: 'expired' }
    }

    // Recruitee forms typically have these fields
    // The form is usually directly on the page at /c/new URLs
    const hasCaptcha = await detectCaptcha(page)
    if (hasCaptcha) {
      return { status: 'captcha_blocked' }
    }

    // Fill basic fields — Recruitee uses various input patterns
    // Try common selectors
    const fieldMappings: [string, string][] = [
      ['input[name*="name" i]', profile.fullName],
      ['input[name*="full_name" i]', profile.fullName],
      ['input[name*="email" i]', profile.email],
      ['input[name*="phone" i]', profile.phone],
    ]

    let filledCount = 0
    for (const [selector, value] of fieldMappings) {
      const filled = await fillField(page, selector, value)
      if (filled) filledCount++
    }

    // Try to upload resume
    const resumeSelectors = [
      'input[type="file"][accept*="pdf"]',
      'input[type="file"][name*="resume" i]',
      'input[type="file"][name*="cv" i]',
      'input[type="file"]',
    ]
    for (const selector of resumeSelectors) {
      const uploaded = await uploadFile(page, selector, profile.resumePath)
      if (uploaded) break
    }

    // Check for custom/unexpected fields we couldn't fill
    const allInputs = await page.$$('input:not([type="hidden"]):not([type="file"]), textarea, select')
    const emptyRequired: string[] = []
    for (const input of allInputs) {
      const required = await input.getAttribute('required')
      const value = await input.inputValue().catch(() => '')
      const name = (await input.getAttribute('name')) ?? (await input.getAttribute('placeholder')) ?? 'unknown'
      if (required !== null && !value) {
        emptyRequired.push(name)
      }
    }

    if (emptyRequired.length > 0) {
      return {
        status: 'custom_questions',
        fields: emptyRequired,
      }
    }

    if (filledCount < 2) {
      return {
        status: 'needs_manual',
        reason: `Only filled ${filledCount} fields — form structure may have changed`,
      }
    }

    // Don't actually submit yet — dry run mode
    // In production, you'd do: await page.click('button[type="submit"]')
    return { status: 'applied' }
  },
}
