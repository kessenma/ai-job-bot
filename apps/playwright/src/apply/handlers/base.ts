import type { Page } from 'playwright'

// Re-export detectCaptcha from shared so existing handler imports still work
export { detectCaptcha } from '../../shared/page-status.ts'

export interface WorkExperienceEntry {
  jobTitle: string
  company: string
  location?: string
  startMonth?: string
  startYear?: string
  endMonth?: string
  endYear?: string
  description?: string
}

export interface EducationEntry {
  school: string
  degree?: string
  fieldOfStudy?: string
  gpa?: string
  startYear?: string
  endYear?: string
}

export interface ApplyProfile {
  fullName: string
  email: string
  phone: string
  linkedinUrl: string
  resumePath: string
  coverLetterPath?: string
  // Extended fields for handlers that need them (e.g. Workday)
  firstName?: string
  lastName?: string
  street?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  githubUrl?: string
  workExperiences?: WorkExperienceEntry[]
  education?: EducationEntry[]
  skills?: string[]
}

export interface ApplyResult {
  status: 'applied' | 'expired' | 'captcha_blocked' | 'custom_questions' | 'needs_manual' | 'error'
  fields?: string[]
  reason?: string
  screenshot?: string
  errorContext?: string
  filledFields?: string[]
  skippedFields?: string[]
}

export interface ATSHandler {
  name: string
  canHandle(url: string): boolean
  apply(page: Page, url: string, profile: ApplyProfile): Promise<ApplyResult>
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
