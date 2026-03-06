import type { Page } from 'playwright'
import type { ApplyProfile, ApplyResult } from '../types.ts'
import { type ATSHandler, detectCaptcha, fillField, uploadFile } from './base.ts'

export const joinHandler: ATSHandler = {
  name: 'join',

  canHandle(url: string) {
    return /join\.com/.test(url)
  },

  async apply(page: Page, url: string, profile: ApplyProfile): Promise<ApplyResult> {
    await page.goto(url, { waitUntil: 'networkidle' })

    const pageContent = await page.textContent('body')
    if (pageContent?.includes('no longer available') || pageContent?.includes('expired')) {
      return { status: 'expired' }
    }

    // Join.com usually has an "Apply" button that reveals the form
    const applyButton = await page.$('button:has-text("Apply"), a:has-text("Apply now")')
    if (applyButton) {
      await applyButton.click()
      await page.waitForTimeout(1000)
    }

    const hasCaptcha = await detectCaptcha(page)
    if (hasCaptcha) {
      return { status: 'captcha_blocked' }
    }

    const fieldMappings: [string, string][] = [
      ['input[name*="first_name" i]', profile.fullName.split(' ')[0] ?? ''],
      ['input[name*="last_name" i]', profile.fullName.split(' ').slice(1).join(' ')],
      ['input[name*="name" i]:not([name*="first"]):not([name*="last"])', profile.fullName],
      ['input[name*="email" i]', profile.email],
      ['input[name*="phone" i]', profile.phone],
      ['input[name*="linkedin" i]', profile.linkedinUrl],
    ]

    let filledCount = 0
    for (const [selector, value] of fieldMappings) {
      if (value) {
        const filled = await fillField(page, selector, value)
        if (filled) filledCount++
      }
    }

    // Upload resume
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

    if (filledCount < 2) {
      return {
        status: 'needs_manual',
        reason: `Only filled ${filledCount} fields`,
      }
    }

    // Dry run — don't submit
    return { status: 'applied' }
  },
}
