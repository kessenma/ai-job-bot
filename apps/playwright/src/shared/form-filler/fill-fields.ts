import type { Page } from 'playwright'
import type { FormProfile, FilledField, SkippedField, ScannedField } from './types'
import { cssEscape, LABEL_TO_FIELD } from './constants'
import { selectBestOption } from './select-utils'

/** Build a CSS selector for a scanned field */
export function fieldSelector(field: ScannedField): string {
  return field.id ? `#${cssEscape(field.id)}` :
    field.name ? `[name="${field.name}"]` :
    `input:nth-of-type(${field.index + 1})`
}

/** Match scanned fields to profile values and fill text/select inputs */
export async function fillMatchedFields(
  page: Page,
  fields: ScannedField[],
  profile: FormProfile,
): Promise<{ filled: FilledField[]; skipped: SkippedField[] }> {
  const filled: FilledField[] = []
  const skipped: SkippedField[] = []

  for (const field of fields) {
    if (field.type === 'file') continue
    if (field.type === 'checkbox') continue
    if (!field.label) {
      if (field.required) skipped.push({
        label: field.name || field.id || `field_${field.index}`,
        type: field.type,
        required: field.required,
        options: field.options,
        selector: fieldSelector(field),
      })
      continue
    }

    let matchedField: keyof FormProfile | null = null
    for (const [pattern, profileField] of LABEL_TO_FIELD) {
      if (pattern.test(field.label)) {
        matchedField = profileField
        break
      }
    }

    if (!matchedField || !profile[matchedField]) {
      if (field.required) skipped.push({
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        selector: fieldSelector(field),
      })
      continue
    }

    const value = profile[matchedField] as string
    const selector = fieldSelector(field)

    try {
      if (field.type === 'select') {
        const selected = await selectBestOption(page, selector, value)
        if (selected) {
          filled.push({ label: field.label, field: matchedField, value: selected, type: 'select' })
        } else {
          skipped.push({
            label: field.label,
            type: field.type,
            required: field.required,
            options: field.options,
            selector: fieldSelector(field),
          })
        }
      } else {
        const el = field.id ? page.locator(`#${cssEscape(field.id)}`) :
          field.name ? page.locator(`[name="${field.name}"]`) : null
        if (el) {
          await el.click()
          await el.fill(value)
          filled.push({ label: field.label, field: matchedField, value, type: 'text' })
        }
      }
    } catch {
      skipped.push({
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        selector: fieldSelector(field),
      })
    }
  }

  return { filled, skipped }
}

/** Upload resume and cover letter to file inputs */
export async function fillFileUploads(
  page: Page,
  profile: FormProfile,
): Promise<FilledField[]> {
  const filled: FilledField[] = []

  if (profile.resumePath) {
    try {
      const fileInputs = await page.$$('input[type="file"]')
      for (const input of fileInputs) {
        const label = await page.evaluate((el) => {
          const id = el.id
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`)
            if (lbl) return (lbl.textContent || '').trim()
          }
          const parent = el.closest('div, section, fieldset')
          return parent ? (parent.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100) : ''
        }, input)

        if (/resume|cv|lebenslauf/i.test(label)) {
          await input.setInputFiles(profile.resumePath)
          filled.push({ label, field: 'resumePath', value: profile.resumePath, type: 'file' })
          break
        }
      }
    } catch { /* file upload failed */ }
  }

  if (profile.coverLetterPath) {
    try {
      const fileInputs = await page.$$('input[type="file"]')
      for (const input of fileInputs) {
        const label = await page.evaluate((el) => {
          const id = el.id
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`)
            if (lbl) return (lbl.textContent || '').trim()
          }
          const parent = el.closest('div, section, fieldset')
          return parent ? (parent.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100) : ''
        }, input)

        if (/cover\s*letter|anschreiben|motivationsschreiben/i.test(label)) {
          await input.setInputFiles(profile.coverLetterPath)
          filled.push({ label, field: 'coverLetterPath', value: profile.coverLetterPath, type: 'file' })
          break
        }
      }
    } catch { /* file upload failed */ }
  }

  return filled
}

/** Auto-check privacy/consent checkboxes */
export async function fillConsentCheckboxes(
  page: Page,
): Promise<FilledField[]> {
  const filled: FilledField[] = []

  try {
    const checkboxes = await page.$$('input[type="checkbox"]')
    for (const cb of checkboxes) {
      const isChecked = await cb.isChecked()
      if (isChecked) continue

      const label = await page.evaluate((el) => {
        const id = el.id
        if (id) {
          const lbl = document.querySelector(`label[for="${id}"]`)
          if (lbl) return (lbl.textContent || '').replace(/\s+/g, ' ').trim()
        }
        const parent = el.closest('label')
        if (parent) return (parent.textContent || '').replace(/\s+/g, ' ').trim()
        return ''
      }, cb)

      if (/privacy|datenschutz|consent|einwillig|agree|zustimm|application.*process/i.test(label)) {
        await cb.check()
        filled.push({ label: label.slice(0, 80), field: 'consent', value: 'checked', type: 'checkbox' })
      }
    }
  } catch { /* checkbox handling failed */ }

  return filled
}
