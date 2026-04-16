import type { Page } from 'playwright'
import type { ScannedField } from './types'

/**
 * Scan the page for all form fields, returning a deduplicated list with labels,
 * types, and any available dropdown options.
 *
 * Handles native <select>, <input>, <textarea>, radio groups, custom dropdowns
 * (ARIA listbox/combobox), and React Select components (Greenhouse-style).
 */
export async function scanFormFields(page: Page): Promise<ScannedField[]> {
  return page.evaluate(() => {
    const results: ScannedField[] = []

    const PLACEHOLDER_TEXTS = new Set([
      '', '—', '--', 'select...', 'select', 'bitte wählen', 'please select',
      'choose', 'choose...', 'auswählen', 'auswählen...',
    ])

    /** Walk up from an element to find the nearest label / question text */
    function findLabel(el: Element): string {
      // 1. label[for=id]
      const id = el.id
      if (id) {
        const lbl = document.querySelector(`label[for="${id}"]`)
        if (lbl) {
          const text = (lbl.textContent || '').replace(/\s+/g, ' ').trim()
          if (text && !PLACEHOLDER_TEXTS.has(text.toLowerCase())) return text
        }
      }
      // 2. Wrapping <label>
      const parentLabel = el.closest('label')
      if (parentLabel) {
        const text = (parentLabel.textContent || '').replace(/\s+/g, ' ').trim()
        if (text && !PLACEHOLDER_TEXTS.has(text.toLowerCase())) return text
      }
      // 3. aria-label / aria-labelledby
      const ariaLabel = el.getAttribute('aria-label')
      if (ariaLabel && !PLACEHOLDER_TEXTS.has(ariaLabel.toLowerCase())) return ariaLabel
      const ariaLabelledBy = el.getAttribute('aria-labelledby')
      if (ariaLabelledBy) {
        const ref = document.getElementById(ariaLabelledBy)
        if (ref) {
          const text = (ref.textContent || '').replace(/\s+/g, ' ').trim()
          if (text) return text
        }
      }
      // 4. Walk up to the nearest field wrapper and find a label-like element
      const wrapper = el.closest('.field, .form-field, [class*="field"], [data-field], fieldset, .question')
      if (wrapper) {
        const lbl = wrapper.querySelector('label, legend, .label, [class*="label"], [class*="question"]')
        if (lbl && !lbl.querySelector('input, select, textarea')) {
          const text = (lbl.textContent || '').replace(/\s+/g, ' ').trim()
          if (text && !PLACEHOLDER_TEXTS.has(text.toLowerCase())) return text
        }
      }
      // 5. Previous sibling
      const prev = el.previousElementSibling
      if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV' || prev.tagName === 'P')) {
        const text = (prev.textContent || '').replace(/\s+/g, ' ').trim()
        if (text && !PLACEHOLDER_TEXTS.has(text.toLowerCase())) return text
      }
      // 6. Placeholder as last resort
      return (el as HTMLInputElement).placeholder || ''
    }

    /** Extract options from a <select> element */
    function extractSelectOptions(sel: HTMLSelectElement): string[] {
      return Array.from(sel.options)
        .map((opt) => opt.textContent?.trim() || '')
        .filter((t) => t && !PLACEHOLDER_TEXTS.has(t.toLowerCase()))
    }

    // Track which <select> elements we've already processed (by name or id)
    const processedSelectNames = new Set<string>()

    // --- Pass 1: <select> elements (both visible and hidden) ---
    // Greenhouse often uses hidden <select> elements with options; we want those options
    const selects = document.querySelectorAll('select')
    selects.forEach((sel, index) => {
      const selectEl = sel as HTMLSelectElement
      const options = extractSelectOptions(selectEl)
      const label = findLabel(sel)
      const name = selectEl.name || null
      const id = sel.id || null

      if (name) processedSelectNames.add(name)
      if (id) processedSelectNames.add(id)

      results.push({
        type: 'select',
        label,
        id,
        name,
        required: selectEl.required || selectEl.getAttribute('aria-required') === 'true',
        index,
        options: options.length > 0 ? options : undefined,
      })
    })

    // --- Pass 2: input + textarea (skip radios for now, handle separately) ---
    const inputs = document.querySelectorAll('input, textarea')
    let inputIndex = selects.length
    inputs.forEach((el) => {
      const input = el as HTMLInputElement | HTMLTextAreaElement
      const inputType = (input as HTMLInputElement).type?.toLowerCase()

      // Skip hidden, submit, button
      if (inputType === 'hidden' || inputType === 'submit' || inputType === 'button') return

      const type = el.tagName === 'TEXTAREA' ? 'textarea' :
        inputType === 'file' ? 'file' :
        inputType === 'checkbox' ? 'checkbox' :
        inputType === 'radio' ? 'radio' :
        'text'

      const label = findLabel(el)

      results.push({
        type: type as any,
        label,
        id: el.id || null,
        name: input.name || null,
        required: input.required || input.getAttribute('aria-required') === 'true',
        index: inputIndex++,
      })
    })

    // --- Pass 3: Radio button groups (deduplicate by name) ---
    const radioGroups = new Map<string, { label: string; options: string[]; required: boolean; id: string | null }>()
    for (const r of results) {
      if (r.type !== 'radio' || !r.name) continue
      if (!radioGroups.has(r.name)) {
        const el = document.querySelector(`input[name="${r.name}"]`)
        const groupLabel = el ? findLabel(el.closest('fieldset, .field, [class*="field"]') || el) : r.label
        radioGroups.set(r.name, { label: groupLabel, options: [], required: r.required, id: r.id })
      }
      const group = radioGroups.get(r.name)!
      const radioEl = document.querySelector(`input[name="${r.name}"]#${r.id || '__none'}`) as HTMLInputElement | null
        || document.querySelector(`input[name="${r.name}"][value]`) as HTMLInputElement | null
      if (radioEl) {
        const optLabel = radioEl.closest('label')?.textContent?.trim()
          || radioEl.getAttribute('aria-label')
          || radioEl.value
          || r.label
        if (optLabel && !group.options.includes(optLabel)) {
          group.options.push(optLabel)
        }
      }
    }

    // Remove individual radio entries, replace with grouped selects
    let cleaned = results.filter((r) => r.type !== 'radio')
    for (const [name, group] of radioGroups) {
      cleaned.push({
        type: 'select',
        label: group.label,
        id: group.id,
        name,
        required: group.required,
        index: cleaned.length,
        options: group.options,
      })
    }

    // --- Pass 4: Custom dropdown components ---
    const customDropdowns = document.querySelectorAll(
      '[role="listbox"], [role="combobox"], [data-provides="select"], .custom-select'
    )
    customDropdowns.forEach((dd) => {
      const label = findLabel(dd)
      const options = Array.from(dd.querySelectorAll('[role="option"], li, option'))
        .map((opt) => opt.textContent?.trim() || '')
        .filter((t) => t && !PLACEHOLDER_TEXTS.has(t.toLowerCase()))

      if (options.length === 0) return

      // Check if we already have a <select> with the same label — if so, enrich it with options
      const existing = cleaned.find((f) =>
        f.type === 'select' && f.label === label && (!f.options || f.options.length === 0)
      )
      if (existing) {
        existing.options = options
        return
      }

      // Check if there's already a matching entry by name
      const ddName = dd.getAttribute('name') || dd.querySelector('select')?.getAttribute('name')
      if (ddName && processedSelectNames.has(ddName)) return

      cleaned.push({
        type: 'select',
        label,
        id: dd.id || null,
        name: ddName || null,
        required: dd.getAttribute('aria-required') === 'true',
        index: cleaned.length,
        options,
      })
    })

    // --- Pass 4b: React Select components (Greenhouse-style) ---
    const reactSelects = document.querySelectorAll('[class*="select__control"]')
    reactSelects.forEach((ctrl) => {
      const label = findLabel(ctrl)
      if (!label) return

      const existingEntries = cleaned.filter((f) => f.label === label)
      if (existingEntries.length > 0) {
        const innerInput = ctrl.querySelector('input')
        for (const existing of existingEntries) {
          if (existing.type !== 'text') continue
          if (innerInput && existing.id && innerInput.id === existing.id) {
            existing.type = 'select'
            existing.options = undefined
          }
          if (innerInput && existing.name && (innerInput as HTMLInputElement).name === existing.name) {
            existing.type = 'select'
            existing.options = undefined
          }
          if (!existing.id && !existing.name) {
            existing.type = 'select'
            existing.options = undefined
          }
        }
        return
      }

      // Walk up to find the wrapper to check for required
      const wrapper = ctrl.closest('[class*="field"], fieldset, .field')
      const isRequired = wrapper?.querySelector('abbr, [class*="required"], .required') !== null
        || (wrapper?.textContent?.includes('*') ?? false)

      cleaned.push({
        type: 'select',
        label,
        id: null,
        name: null,
        required: isRequired,
        index: cleaned.length,
        options: undefined, // Will be populated by click-to-discover
      })
    })

    // --- Pass 5: Deduplicate by label ---
    const seen = new Map<string, number>()
    const final: typeof cleaned = []
    for (const field of cleaned) {
      const key = field.label
      if (!key) {
        final.push(field)
        continue
      }
      if (seen.has(key)) {
        const prevIdx = seen.get(key)!
        const prev = final[prevIdx]
        const fieldIsSelect = field.type === 'select'
        const prevIsSelect = prev.type === 'select'
        let replace = false
        if (fieldIsSelect && !prevIsSelect) {
          replace = !(prev.id || prev.name) || !!(field.id || field.name)
        } else if (field.options && field.options.length > (prev.options?.length || 0)) {
          replace = true
        }

        if (replace) {
          if (!field.id && prev.id) field.id = prev.id
          if (!field.name && prev.name) field.name = prev.name
          final[prevIdx] = field
        } else {
          if (!prev.id && field.id) prev.id = field.id
          if (!prev.name && field.name) prev.name = field.name
        }
        continue
      }
      seen.set(key, final.length)
      final.push(field)
    }

    return final
  })
}
