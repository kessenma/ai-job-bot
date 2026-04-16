import type { Page } from 'playwright'
import type { ATSHandler, ApplyProfile, ApplyResult } from './base.ts'
import { detectCaptcha, uploadFile } from './base.ts'
import { selectorExists, withOptSelector, selectWorkdayDropdown, fillWorkdayDateField, delay } from './workday-utils.ts'

const NEXT_BUTTON = 'button[data-automation-id="bottom-navigation-next-button"]'
const PAGE_TIMEOUT = 30_000

export const workdayHandler: ATSHandler = {
  name: 'workday',

  canHandle(url: string) {
    return /myworkdayjobs\.com/.test(url)
  },

  async apply(page: Page, url: string, profile: ApplyProfile): Promise<ApplyResult> {
    const filledFields: string[] = []
    const skippedFields: string[] = []

    try {
      // Navigate to the job page
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
      await delay(2000)

      // Check if the job is expired
      const pageText = await page.textContent('body')
      if (pageText?.match(/no longer (accepting|available)|position.*(?:filled|closed|expired)/i)) {
        return { status: 'expired' }
      }

      // Check for captcha
      if (await detectCaptcha(page)) {
        return { status: 'captcha_blocked' }
      }

      // --- Start Application Flow ---
      const started = await startApplication(page)
      if (!started) {
        return {
          status: 'needs_manual',
          reason: 'Could not start application — may require Workday login',
          screenshot: await takeScreenshot(page),
        }
      }

      // --- Page 1: Contact Information ---
      const page1 = await waitForPage(page, 'contactInformationPage')
      if (!page1) {
        return {
          status: 'needs_manual',
          reason: 'Contact information page did not load',
          screenshot: await takeScreenshot(page),
        }
      }

      await fillContactInfo(page, profile, filledFields, skippedFields)
      await clickNext(page)

      // --- Page 2: Experience ---
      const page2 = await waitForPage(page, 'myExperiencePage')
      if (page2) {
        await fillExperience(page, profile, filledFields, skippedFields)
        await clickNext(page)
      }

      // --- Pages 3-4: Voluntary Disclosures / Self-Identification ---
      // Click through these pages without filling for now
      if (await waitForPage(page, 'voluntaryDisclosuresPage', 5000)) {
        await clickNext(page)
      }
      if (await waitForPage(page, 'selfIdentificationPage', 5000)) {
        await clickNext(page)
      }

      // Dry run — don't submit. Take a screenshot of the review page.
      return {
        status: 'applied',
        filledFields,
        skippedFields,
        screenshot: await takeScreenshot(page),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        status: 'error',
        reason: message,
        errorContext: `Handler failed during form flow`,
        screenshot: await takeScreenshot(page).catch(() => undefined),
        filledFields,
        skippedFields,
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Application start flow
// ---------------------------------------------------------------------------

async function startApplication(page: Page): Promise<boolean> {
  // Try clicking the Apply button(s)
  const adventureButton = 'a[data-automation-id="adventureButton"]'

  if (!(await selectorExists(page, adventureButton, 5000))) {
    return false
  }

  try {
    await page.locator(adventureButton).click()
    await delay(1000)

    // Some pages show a second adventure button
    if (await selectorExists(page, adventureButton, 2000)) {
      await page.locator(adventureButton).click()
      await delay(1000)
    }

    // Look for "Apply Manually" option
    const applyManually = 'a[data-automation-id="applyManually"]'
    if (await selectorExists(page, applyManually, 3000)) {
      await page.locator(applyManually).click()
      await delay(1000)
    }

    // Check if sign-in is required
    const signInButton = 'button[data-automation-id="utilityButtonSignIn"]'
    if (await selectorExists(page, signInButton, 2000)) {
      // Auth required but no credentials available in this flow
      return false
    }

    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Page 1: Contact Information
// ---------------------------------------------------------------------------

async function fillContactInfo(
  page: Page,
  profile: ApplyProfile,
  filled: string[],
  skipped: string[],
): Promise<void> {
  // Previous worker radio
  await withOptSelector(page, 'div[data-automation-id="previousWorker"] input[id="2"]', async (el) => {
    await el.click()
  })

  // Name fields
  const firstName = profile.firstName ?? profile.fullName.split(' ')[0]
  const lastName = profile.lastName ?? profile.fullName.split(' ').slice(1).join(' ')

  if (await withOptSelector(page, 'input[data-automation-id="legalNameSection_firstName"]', (el) => el.fill(firstName))) {
    filled.push('firstName')
  } else {
    skipped.push('firstName')
  }

  if (await withOptSelector(page, 'input[data-automation-id="legalNameSection_lastName"]', (el) => el.fill(lastName))) {
    filled.push('lastName')
  } else {
    skipped.push('lastName')
  }

  // Address
  if (profile.street) {
    if (await withOptSelector(page, 'input[data-automation-id="addressSection_addressLine1"]', (el) => el.fill(profile.street!))) {
      filled.push('street')
    } else {
      skipped.push('street')
    }
  }

  if (profile.city) {
    if (await withOptSelector(page, 'input[data-automation-id="addressSection_city"]', (el) => el.fill(profile.city!))) {
      filled.push('city')
    } else {
      skipped.push('city')
    }
  }

  if (profile.state) {
    if (await selectWorkdayDropdown(page, 'button[data-automation-id="addressSection_countryRegion"]', profile.state)) {
      filled.push('state')
    } else {
      skipped.push('state')
    }
  }

  if (profile.zipCode) {
    if (await withOptSelector(page, 'input[data-automation-id="addressSection_postalCode"]', (el) => el.fill(profile.zipCode!))) {
      filled.push('zipCode')
    } else {
      skipped.push('zipCode')
    }
  }

  // Phone
  await selectWorkdayDropdown(page, 'button[data-automation-id="phone-device-type"]', 'Mobile')

  if (await withOptSelector(page, 'input[data-automation-id="phone-number"]', (el) => el.fill(profile.phone))) {
    filled.push('phone')
  } else {
    skipped.push('phone')
  }

  // Email (some Workday forms have an email field on Page 1)
  if (await withOptSelector(page, 'input[data-automation-id="email"]', (el) => el.fill(profile.email), 1000)) {
    filled.push('email')
  }
}

// ---------------------------------------------------------------------------
// Page 2: Experience (resume, links, work history, education)
// ---------------------------------------------------------------------------

async function fillExperience(
  page: Page,
  profile: ApplyProfile,
  filled: string[],
  skipped: string[],
): Promise<void> {
  // --- Work Experience ---
  if (profile.workExperiences?.length) {
    let addedWorks = 0
    for (const work of profile.workExperiences) {
      addedWorks++
      const workDiv = `div[data-automation-id="workExperience-${addedWorks}"]`

      if (!(await selectorExists(page, workDiv))) {
        // Create the work experience section
        const addSel = addedWorks === 1
          ? 'div[data-automation-id="workExperienceSection"] button[data-automation-id*="add"]'
          : 'div[data-automation-id="workExperienceSection"] button[data-automation-id*="Add"]'
        await withOptSelector(page, addSel, (el) => el.click(), 5000)
        await delay(500)
      }

      await withOptSelector(page, `${workDiv} input[data-automation-id="jobTitle"]`, (el) => el.fill(work.jobTitle))
      await withOptSelector(page, `${workDiv} input[data-automation-id="company"]`, (el) => el.fill(work.company))

      if (work.location) {
        await withOptSelector(page, `${workDiv} input[data-automation-id="location"]`, (el) => el.fill(work.location!))
      }

      // Dates
      if (work.startMonth && work.startYear) {
        await fillWorkdayDateField(page, `${workDiv} div[data-automation-id="formField-startDate"]`, work.startMonth, work.startYear)
      }
      if (work.endMonth && work.endYear) {
        await fillWorkdayDateField(page, `${workDiv} div[data-automation-id="formField-endDate"]`, work.endMonth, work.endYear)
      }

      if (work.description) {
        await withOptSelector(page, `${workDiv} textarea[data-automation-id="description"]`, (el) => el.fill(work.description!))
      }
    }
    filled.push('workExperience')
  }

  // --- Education ---
  if (profile.education?.length) {
    const edu = profile.education[0] // Fill first education entry

    await withOptSelector(page, 'div[data-automation-id="educationSection"] button[data-automation-id="Add"]', (el) => el.click())
    await delay(500)

    if (edu.school) {
      await withOptSelector(page, 'div[data-automation-id="formField-schoolItem"] input', async (el) => {
        await el.fill(edu.school)
        await page.keyboard.press('Enter')
        await delay(1000)
        await page.keyboard.press('Enter')
      })
      filled.push('school')
    }

    if (edu.degree) {
      await selectWorkdayDropdown(page, 'button[data-automation-id="degree"]', edu.degree)
      filled.push('degree')
    }

    if (edu.gpa) {
      await withOptSelector(page, 'input[data-automation-id="gpa"]', (el) => el.fill(edu.gpa!))
      filled.push('gpa')
    }

    if (edu.startYear) {
      await withOptSelector(page, 'div[data-automation-id="formField-firstYearAttended"] input', (el) => el.fill(edu.startYear!))
    }
    if (edu.endYear) {
      await withOptSelector(page, 'div[data-automation-id="formField-lastYearAttended"] input', (el) => el.fill(edu.endYear!))
    }
  }

  // --- Skills ---
  if (profile.skills?.length) {
    await withOptSelector(page, 'div[data-automation-id="formField-skillsPrompt"] input', async (el) => {
      for (const skill of profile.skills!) {
        await el.fill(skill)
        await page.keyboard.press('Enter')
        await delay(1000)
        await page.keyboard.press('Enter')
        await delay(500)
      }
      filled.push('skills')
    })
  }

  // --- Resume Upload ---
  if (profile.resumePath) {
    const resumeSel = 'input[data-automation-id="file-upload-input-ref"]'
    if (await uploadFile(page, resumeSel, profile.resumePath)) {
      filled.push('resume')
      await delay(2000) // Wait for upload to process
    } else {
      skipped.push('resume')
    }
  }

  // --- LinkedIn ---
  if (profile.linkedinUrl) {
    const linkedInInput = 'input[data-automation-id="linkedinQuestion"]'
    if (await selectorExists(page, linkedInInput)) {
      await page.locator(linkedInInput).fill(profile.linkedinUrl)
      filled.push('linkedinUrl')
    } else {
      // Use generic website panel
      await addWebsiteLink(page, profile.linkedinUrl, 1)
      filled.push('linkedinUrl')
    }
  }

  // --- GitHub ---
  if (profile.githubUrl) {
    const websiteIndex = profile.linkedinUrl ? 2 : 1
    await addWebsiteLink(page, profile.githubUrl, websiteIndex)
    filled.push('githubUrl')
  }
}

async function addWebsiteLink(page: Page, url: string, index: number): Promise<void> {
  const panelSel = `div[data-automation-id="websitePanelSet-${index}"] input`
  if (!(await selectorExists(page, panelSel))) {
    await withOptSelector(
      page,
      'div[data-automation-id="websiteSection"] button[data-automation-id="Add"]',
      (el) => el.click(),
    )
    await delay(500)
  }
  if (await selectorExists(page, panelSel)) {
    await page.locator(panelSel).fill(url)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForPage(page: Page, automationId: string, timeout = PAGE_TIMEOUT): Promise<boolean> {
  return selectorExists(page, `div[data-automation-id="${automationId}"]`, timeout)
}

async function clickNext(page: Page): Promise<void> {
  await withOptSelector(page, NEXT_BUTTON, async (el) => {
    await el.click()
    await delay(1000)
  })
}

async function takeScreenshot(page: Page): Promise<string | undefined> {
  try {
    const buf = await page.screenshot({ type: 'png', fullPage: true })
    return buf.toString('base64')
  } catch {
    return undefined
  }
}
