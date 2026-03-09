import type { Page } from 'playwright'

export interface ApplyProfile {
  fullName: string
  email: string
  phone: string
  linkedinUrl: string
  resumePath: string
  coverLetterPath?: string
}

export interface ApplyResult {
  status: 'applied' | 'expired' | 'captcha_blocked' | 'custom_questions' | 'needs_manual'
  fields?: string[]
  reason?: string
}

export interface ATSHandler {
  name: string
  canHandle(url: string): boolean
  apply(page: Page, url: string, profile: ApplyProfile): Promise<ApplyResult>
}

export async function detectCaptcha(page: Page): Promise<boolean> {
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    '.g-recaptcha',
    '.h-captcha',
    '[data-sitekey]',
    '#captcha',
  ]
  for (const selector of captchaSelectors) {
    const el = await page.$(selector)
    if (el) return true
  }
  return false
}

export async function fillField(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    const el = await page.$(selector)
    if (!el) return false
    await el.click()
    await el.fill(value)
    return true
  } catch {
    return false
  }
}

export async function uploadFile(page: Page, selector: string, filePath: string): Promise<boolean> {
  try {
    const input = await page.$(selector)
    if (!input) return false
    await input.setInputFiles(filePath)
    return true
  } catch {
    return false
  }
}
