import type { Page } from 'playwright'
import { humanDelay, humanType, humanClick, waitForFullLoad } from '../shared/humanize'
import { LABEL_TO_FIELD, DROPDOWN_SYNONYMS, type FormProfile } from '../shared/form-filler'

/** cssEscape polyfill for Node.js */
const cssEscape = typeof CSS !== 'undefined' && cssEscape
  ? cssEscape
  : (s: string) => s.replace(/([^\w-])/g, '\\$1')

// LinkedIn-specific question patterns that extend the base LABEL_TO_FIELD
const LINKEDIN_QUESTION_MAP: [RegExp, keyof FormProfile | string][] = [
  // These are LinkedIn Easy Apply specific patterns
  [/years?\s*(of)?\s*experience/i, 'yearsOfExperience'],
  [/work\s*authorization|authorized.*work/i, 'workVisaStatus'],
  [/require.*sponsorship|visa\s*sponsorship|need.*sponsorship/i, 'requireSponsorship'],
  [/desired\s*salary|salary\s*expectation|expected.*salary|compensation/i, 'salaryExpectations'],
  [/when.*start|start\s*date|earliest.*start/i, 'earliestStartDate'],
  [/notice\s*period/i, 'availability'],
  [/willing.*relocate|open.*relocation|relocate/i, 'willingToRelocate'],
  [/commute|commuting.*daily/i, 'willingToRelocate'],
  [/previously.*worked|worked.*before.*company/i, 'previouslyWorked'],
  [/reference|contact.*provided/i, 'referenceCheck'],
  [/certification/i, 'certifications'],
  // Fall through to base patterns
  ...LABEL_TO_FIELD,
]

export interface EasyApplyProfile extends FormProfile {
  yearsOfExperience?: string
  requireSponsorship?: string // 'Yes' | 'No'
  willingToRelocate?: string  // 'Yes' | 'No'
  previouslyWorked?: string   // 'Yes' | 'No'
  referenceCheck?: string     // 'Yes' | 'No'
  certifications?: string
}

export interface AnsweredQuestion {
  label: string
  value: string
  type: 'text' | 'select' | 'radio' | 'checkbox' | 'file'
}

export interface UnansweredQuestion {
  label: string
  type: 'text' | 'select' | 'radio' | 'checkbox'
  options?: string[]
  required: boolean
}

export interface EasyApplyResult {
  status: 'applied' | 'review_needed' | 'failed' | 'no_easy_apply'
  stepsCompleted: number
  answeredQuestions: AnsweredQuestion[]
  unansweredQuestions: UnansweredQuestion[]
  error?: string
}

const EASY_APPLY_BUTTON_SELECTORS = [
  '.jobs-apply-button--top-card button',
  'button.jobs-apply-button',
  'button[aria-label*="Easy Apply"]',
  '#jobs-apply-button-id',
  'button.jobs-s-apply',
]

const MODAL_SELECTOR = 'div.jobs-easy-apply-modal, div[class*="easy-apply-modal"], div[role="dialog"][aria-label*="apply"]'

/**
 * Extract the label text for a form element using multiple strategies.
 */
async function extractLabel(page: Page, el: any): Promise<string> {
  return page.evaluate((element: HTMLElement) => {
    // 1. Associated <label for="id">
    const id = element.id
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`)
      if (label) return (label.textContent || '').replace(/\s+/g, ' ').trim()
    }

    // 2. Parent <label>
    const parentLabel = element.closest('label')
    if (parentLabel) return (parentLabel.textContent || '').replace(/\s+/g, ' ').trim()

    // 3. aria-label
    const ariaLabel = element.getAttribute('aria-label')
    if (ariaLabel) return ariaLabel.trim()

    // 4. placeholder
    const placeholder = (element as HTMLInputElement).placeholder
    if (placeholder) return placeholder.trim()

    // 5. <legend> in closest fieldset (for radio groups)
    const fieldset = element.closest('fieldset')
    if (fieldset) {
      const legend = fieldset.querySelector('legend')
      if (legend) return (legend.textContent || '').replace(/\s+/g, ' ').trim()
    }

    // 6. Previous sibling text
    const prev = element.previousElementSibling
    if (prev && ['LABEL', 'SPAN', 'DIV', 'P'].includes(prev.tagName)) {
      return (prev.textContent || '').replace(/\s+/g, ' ').trim()
    }

    // 7. aria-describedby
    const describedBy = element.getAttribute('aria-describedby')
    if (describedBy) {
      const desc = document.getElementById(describedBy)
      if (desc) return (desc.textContent || '').replace(/\s+/g, ' ').trim()
    }

    return ''
  }, el)
}

/**
 * Match a question label to a profile value.
 */
function getAnswerForQuestion(label: string, profile: EasyApplyProfile): { field: string; value: string } | null {
  for (const [pattern, fieldName] of LINKEDIN_QUESTION_MAP) {
    if (pattern.test(label)) {
      const value = (profile as any)[fieldName]
      if (value) return { field: fieldName as string, value }
    }
  }
  return null
}

/**
 * Fill all form fields in the current step of the Easy Apply modal.
 */
async function fillCurrentStep(
  page: Page,
  profile: EasyApplyProfile,
  answered: AnsweredQuestion[],
  unanswered: UnansweredQuestion[],
): Promise<void> {
  const modal = await page.$(MODAL_SELECTOR)
  if (!modal) return

  // Fill phone inputs
  const phoneSelectors = [
    'input[name*="phoneNumber"]', 'input[name*="phone"]',
    'input[id*="phone"]', 'input[type="tel"]', 'input[inputmode="tel"]',
  ]
  for (const sel of phoneSelectors) {
    const phoneInput = await modal.$(sel)
    if (phoneInput) {
      const isVisible = await phoneInput.isVisible().catch(() => false)
      const currentVal = await phoneInput.inputValue().catch(() => '')
      if (isVisible && !currentVal && profile.phone) {
        const fullPhone = profile.phoneCountryCode
          ? `${profile.phoneCountryCode}${profile.phone}`
          : profile.phone
        await phoneInput.fill(fullPhone)
        answered.push({ label: 'Phone', value: fullPhone, type: 'text' })
      }
      break
    }
  }

  // Fill email inputs
  const emailInput = await modal.$('input[name*="email"], input[type="email"]')
  if (emailInput) {
    const isVisible = await emailInput.isVisible().catch(() => false)
    const currentVal = await emailInput.inputValue().catch(() => '')
    if (isVisible && !currentVal && profile.email) {
      await emailInput.fill(profile.email)
      answered.push({ label: 'Email', value: profile.email, type: 'text' })
    }
  }

  // Handle file uploads (resume)
  const fileInput = await modal.$('input[type="file"]')
  if (fileInput && profile.resumePath) {
    try {
      await fileInput.setInputFiles(profile.resumePath)
      answered.push({ label: 'Resume', value: profile.resumePath, type: 'file' })
    } catch { /* file upload failed, continue */ }
  }

  // Fill text inputs, number inputs, textareas
  const textInputs = await modal.$$('input[type="text"], input[type="number"], textarea')
  for (const input of textInputs) {
    const isVisible = await input.isVisible().catch(() => false)
    if (!isVisible) continue

    const currentVal = await input.inputValue().catch(() => '')
    if (currentVal) continue // already filled

    const label = await extractLabel(page, input)
    if (!label) continue

    const answer = getAnswerForQuestion(label, profile)
    if (answer) {
      await input.fill(answer.value)
      answered.push({ label, value: answer.value, type: 'text' })
    } else {
      const required = await input.evaluate((el: HTMLInputElement) =>
        el.required || el.getAttribute('aria-required') === 'true'
      ).catch(() => false)
      unanswered.push({ label, type: 'text', required })
    }
  }

  // Handle radio buttons (fieldsets and radiogroups)
  const radioGroups = await modal.$$('fieldset, div[role="radiogroup"]')
  for (const group of radioGroups) {
    const isVisible = await group.isVisible().catch(() => false)
    if (!isVisible) continue

    const label = await extractLabel(page, group)
    if (!label) continue

    const answer = getAnswerForQuestion(label, profile)
    if (answer) {
      // Try to select matching radio option
      const selected = await selectRadioOption(page, group, answer.value)
      if (selected) {
        answered.push({ label, value: answer.value, type: 'radio' })
      } else {
        const options = await getRadioOptions(group)
        unanswered.push({ label, type: 'radio', options, required: true })
      }
    } else {
      const options = await getRadioOptions(group)
      unanswered.push({ label, type: 'radio', options, required: true })
    }
  }

  // Handle dropdowns (<select> elements)
  const selects = await modal.$$('select')
  for (const select of selects) {
    const isVisible = await select.isVisible().catch(() => false)
    if (!isVisible) continue

    const label = await extractLabel(page, select)
    if (!label) continue

    const answer = getAnswerForQuestion(label, profile)
    if (answer) {
      const selectId = await select.getAttribute('id')
      const selector = selectId ? `#${cssEscape(selectId)}` : 'select'
      // Use the imported selectBestOption via page.evaluate approach
      const selected = await selectDropdownOption(page, select, answer.value)
      if (selected) {
        answered.push({ label, value: selected, type: 'select' })
      } else {
        const options = await getSelectOptions(select)
        unanswered.push({ label, type: 'select', options, required: true })
      }
    } else {
      const options = await getSelectOptions(select)
      unanswered.push({ label, type: 'select', options, required: true })
    }
  }
}

async function selectRadioOption(page: Page, group: any, answer: string): Promise<boolean> {
  const answerLower = answer.toLowerCase()

  // Try direct value match
  const valueSelectors = [
    `input[type="radio"][value="${answer}"]`,
    `input[type="radio"][value="${answerLower}"]`,
  ]
  // For Yes/No answers, also try true/false
  if (answerLower === 'yes') {
    valueSelectors.push('input[type="radio"][value="true"]', 'input[type="radio"][value="True"]')
  } else if (answerLower === 'no') {
    valueSelectors.push('input[type="radio"][value="false"]', 'input[type="radio"][value="False"]')
  }

  for (const sel of valueSelectors) {
    const radio = await group.$(sel)
    if (radio) {
      try {
        await radio.click({ force: true })
        return true
      } catch { /* try next selector */ }
    }
  }

  // Try matching by label text
  const labels = await group.$$('label')
  for (const label of labels) {
    const text = await label.textContent().catch(() => '')
    if (text.toLowerCase().trim() === answerLower || text.toLowerCase().includes(answerLower)) {
      try {
        await label.click({ force: true })
        return true
      } catch { /* try next label */ }
    }
  }

  return false
}

async function getRadioOptions(group: any): Promise<string[]> {
  const labels = await group.$$('label')
  const options: string[] = []
  for (const label of labels) {
    const text = await label.textContent().catch(() => '')
    if (text.trim()) options.push(text.trim())
  }
  return options
}

async function selectDropdownOption(page: Page, select: any, desiredValue: string): Promise<string | null> {
  try {
    const options = await select.evaluate((el: HTMLSelectElement) =>
      Array.from(el.options).map((opt) => ({ value: opt.value, text: opt.textContent?.trim() || '' }))
    )

    const desired = desiredValue.toLowerCase()
    const matchTerms = [desired, ...(DROPDOWN_SYNONYMS[desired] ?? [])]

    // Exact match
    for (const term of matchTerms) {
      for (const opt of options) {
        const text = opt.text.toLowerCase()
        if (text === term || opt.value.toLowerCase() === term) {
          await select.selectOption(opt.value)
          return opt.text
        }
      }
    }

    // Substring match
    for (const term of matchTerms) {
      for (const opt of options) {
        const text = opt.text.toLowerCase()
        if ((text.includes(term) || term.includes(text)) && opt.value && opt.text !== '' && opt.text !== '--') {
          await select.selectOption(opt.value)
          return opt.text
        }
      }
    }

    return null
  } catch {
    return null
  }
}

async function getSelectOptions(select: any): Promise<string[]> {
  try {
    return select.evaluate((el: HTMLSelectElement) =>
      Array.from(el.options)
        .filter((opt) => opt.value && opt.textContent?.trim())
        .map((opt) => opt.textContent!.trim())
    )
  } catch {
    return []
  }
}

/**
 * Main Easy Apply automation function.
 * Navigates to the job, clicks Easy Apply, and fills the multi-step form.
 */
export async function easyApply(
  page: Page,
  jobUrl: string,
  profile: EasyApplyProfile,
  dryRun = false,
): Promise<EasyApplyResult> {
  const answered: AnsweredQuestion[] = []
  const unanswered: UnansweredQuestion[] = []
  let stepsCompleted = 0

  // Navigate to job page
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await waitForFullLoad(page)

  // Find Easy Apply button
  let easyApplyBtn: any = null
  for (const sel of EASY_APPLY_BUTTON_SELECTORS) {
    try {
      easyApplyBtn = await page.$(sel)
      if (easyApplyBtn) {
        const isVisible = await easyApplyBtn.isVisible().catch(() => false)
        if (isVisible) break
        easyApplyBtn = null
      }
    } catch { /* try next selector */ }
  }

  if (!easyApplyBtn) {
    return { status: 'no_easy_apply', stepsCompleted: 0, answeredQuestions: answered, unansweredQuestions: unanswered, error: 'No Easy Apply button found on this job.' }
  }

  // Click Easy Apply
  await humanDelay(500, 1000)
  try {
    await easyApplyBtn.click()
  } catch {
    // Fallback: JS click
    await page.evaluate((el: HTMLElement) => el.click(), easyApplyBtn)
  }

  // Wait for modal
  try {
    await page.waitForSelector(MODAL_SELECTOR, { timeout: 10000 })
  } catch {
    return { status: 'failed', stepsCompleted: 0, answeredQuestions: answered, unansweredQuestions: unanswered, error: 'Easy Apply modal did not appear.' }
  }

  await humanDelay(1000, 2000)

  // Multi-step form loop (max 10 steps)
  const MAX_STEPS = 10
  for (let step = 0; step < MAX_STEPS; step++) {
    // Fill the current step
    await fillCurrentStep(page, profile, answered, unanswered)
    stepsCompleted = step + 1
    await humanDelay(500, 1000)

    // Check for Submit button
    const submitBtn = await page.$('button:has-text("Submit application"), button[aria-label="Submit application"]')
    if (submitBtn) {
      const isVisible = await submitBtn.isVisible().catch(() => false)
      if (isVisible) {
        if (dryRun) {
          return { status: 'review_needed', stepsCompleted, answeredQuestions: answered, unansweredQuestions: unanswered }
        }
        await humanDelay(300, 600)
        await submitBtn.click()
        await humanDelay(2000, 3000)
        return { status: 'applied', stepsCompleted, answeredQuestions: answered, unansweredQuestions: unanswered }
      }
    }

    // Check for Review button
    const reviewBtn = await page.$('button:has-text("Review"), button[aria-label="Review your application"]')
    if (reviewBtn) {
      const isVisible = await reviewBtn.isVisible().catch(() => false)
      if (isVisible) {
        await humanDelay(300, 600)
        await reviewBtn.click()
        await humanDelay(1000, 2000)
        // After review, look for Submit
        const submitAfterReview = await page.$('button:has-text("Submit application"), button[aria-label="Submit application"]')
        if (submitAfterReview) {
          if (dryRun) {
            return { status: 'review_needed', stepsCompleted, answeredQuestions: answered, unansweredQuestions: unanswered }
          }
          await humanDelay(300, 600)
          await submitAfterReview.click()
          await humanDelay(2000, 3000)
          return { status: 'applied', stepsCompleted, answeredQuestions: answered, unansweredQuestions: unanswered }
        }
        continue
      }
    }

    // Check for Next button
    const nextBtn = await page.$('button:has-text("Next"), button[aria-label="Continue to next step"]')
    if (nextBtn) {
      const isVisible = await nextBtn.isVisible().catch(() => false)
      if (isVisible) {
        await humanDelay(300, 600)
        await nextBtn.click()
        await humanDelay(1000, 2000)
        continue
      }
    }

    // No action button found — stuck
    return { status: 'failed', stepsCompleted, answeredQuestions: answered, unansweredQuestions: unanswered, error: 'No Next/Review/Submit button found. Form may be stuck.' }
  }

  return { status: 'failed', stepsCompleted, answeredQuestions: answered, unansweredQuestions: unanswered, error: `Exceeded maximum ${MAX_STEPS} steps.` }
}
