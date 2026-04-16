import type { Page } from 'playwright'
import type { FormProfile, FilledField, SkippedField } from './types'
import { scanFormFields } from './scan-fields'
import { discoverDropdownOptions } from './discover-options'
import { fillMatchedFields, fillFileUploads, fillConsentCheckboxes } from './fill-fields'

// Re-export everything consumers need
export type { FormProfile, FilledField, SkippedField, ScannedField } from './types'
export { LABEL_TO_FIELD, DROPDOWN_SYNONYMS, cssEscape } from './constants'
export { selectBestOption } from './select-utils'
export { scanFormFields } from './scan-fields'
export { discoverDropdownOptions } from './discover-options'
export { fillMatchedFields, fillFileUploads, fillConsentCheckboxes, fieldSelector } from './fill-fields'

/**
 * Main orchestrator: scan the page for form fields, discover dropdown options,
 * fill in profile data, upload files, and check consent boxes.
 */
export async function fillForm(
  page: Page,
  profile: FormProfile,
  log?: (msg: string) => void,
): Promise<{ filled: FilledField[]; skipped: SkippedField[] }> {
  const _log = log ?? ((msg: string) => console.log(`[form-filler] ${msg}`))

  // 1. Scan all form fields on the page
  const fields = await scanFormFields(page)

  const selectFields = fields.filter((f) => f.type === 'select')
  const textFields = fields.filter((f) => f.type === 'text' || f.type === 'textarea')
  _log(`Scanned ${fields.length} fields: ${selectFields.length} select, ${textFields.length} text`)

  const needsDiscovery = selectFields.filter((f) => !f.options || f.options.length === 0)
  if (needsDiscovery.length > 0) {
    _log(`Click-to-discover needed for ${needsDiscovery.length} select fields: ${needsDiscovery.map((f) => f.label).join(', ')}`)
  }

  // 2. Discover options for custom dropdowns that didn't expose them statically
  await discoverDropdownOptions(page, fields, _log)

  // 3. Fill text inputs and native selects
  const { filled, skipped } = await fillMatchedFields(page, fields, profile)

  // 4. Upload resume + cover letter
  const fileFilled = await fillFileUploads(page, profile)
  filled.push(...fileFilled)

  // 5. Auto-check consent checkboxes
  const checkboxFilled = await fillConsentCheckboxes(page)
  filled.push(...checkboxFilled)

  return { filled, skipped }
}
