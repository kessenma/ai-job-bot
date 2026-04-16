import type { Page } from 'playwright'
import type { ScannedField } from './types'

/**
 * For select-type fields with no options, click into custom dropdown triggers
 * (Greenhouse/Lever React Select, etc.) to discover available choices.
 */
export async function discoverDropdownOptions(
  page: Page,
  fields: ScannedField[],
  log: (msg: string) => void,
): Promise<void> {
  for (const field of fields) {
    if (field.type !== 'select') continue
    if (field.options && field.options.length > 0) continue

    try {
      const triggerHandle = await page.evaluateHandle((label) => {
        const normalize = (s: string) => s.replace(/\s+/g, ' ').replace(/\*+/g, '').trim()
        const normalLabel = normalize(label)

        const TRIGGER_SELECTOR =
          '[class*="select__control"], [class*="select-trigger"], [class*="dropdown-trigger"], ' +
          '[role="combobox"], [role="listbox"], [class*="Select"], ' +
          'button[class*="select"], div[class*="indicator"], ' +
          '.select, [tabindex="0"]'

        const allLabels = document.querySelectorAll('label, legend, [class*="label"], [class*="question"]')
        for (const lbl of allLabels) {
          const text = normalize(lbl.textContent || '')
          if (text !== normalLabel) continue

          // Strategy A: Walk up to the TIGHTEST wrapper first.
          // Try progressively broader wrappers to avoid matching a container
          // that holds multiple fields (which would return the wrong select__control).
          const tightWrappers = [
            lbl.parentElement,
            lbl.closest('fieldset, [data-field]'),
            lbl.closest('.field, .form-field'),
          ].filter(Boolean) as Element[]

          for (const wrapper of tightWrappers) {
            // Only use this wrapper if it contains exactly ONE select__control
            // (otherwise it's too broad and we'd pick the wrong one)
            const controls = wrapper.querySelectorAll('[class*="select__control"]')
            if (controls.length === 1) {
              return controls[0] as HTMLElement
            }
            // If there are multiple controls, try to find one that's a direct
            // child or close descendant (not nested deep in another field)
            if (controls.length > 1) {
              // Check if any control is a sibling of the label
              const siblings = lbl.parentElement?.children
              if (siblings) {
                for (const sib of siblings) {
                  const ctrl = sib.matches('[class*="select__control"]')
                    ? sib
                    : sib.querySelector('[class*="select__control"]')
                  if (ctrl) return ctrl as HTMLElement
                }
              }
            }
          }

          // Strategy B: Broad wrapper fallback with generic trigger selectors
          const broadWrapper = lbl.closest('[class*="field"], fieldset, [data-field]')
            || lbl.parentElement
          if (broadWrapper) {
            const trigger = broadWrapper.querySelector(TRIGGER_SELECTOR) as HTMLElement | null
            if (trigger) return trigger

            const selectPlaceholder = broadWrapper.querySelector('[class*="placeholder"], [class*="single-value"]') as HTMLElement | null
            if (selectPlaceholder) return (selectPlaceholder.closest('[class*="control"]') || selectPlaceholder) as HTMLElement
          }
        }
        return null
      }, field.label)

      const trigger = triggerHandle.asElement()
      if (!trigger) {
        log(`Click-to-discover: no trigger found for "${field.label}"`)
        continue
      }

      log(`Click-to-discover: clicking trigger for "${field.label}"`)
      await trigger.click()
      await page.waitForTimeout(300)

      // Scrape options scoped to THIS dropdown's container
      const options = await page.evaluate((triggerEl) => {
        const filterOpts = (els: Element[]) =>
          els.map((el) => el.textContent?.trim() || '')
            .filter((t) => t.length > 0 && t.toLowerCase() !== 'select...' && t.toLowerCase() !== 'select')

        // Strategy 1: Find the tight React Select container (select__container)
        // This is the most reliable — the menu renders as a sibling to the control
        const selectContainer = triggerEl.closest('[class*="select__container"]')
        if (selectContainer) {
          const menuInContainer = Array.from(selectContainer.querySelectorAll(
            '[class*="select__option"], [class*="option"]:not([class*="control"]), [role="option"]'
          ))
          if (menuInContainer.length > 0) return filterOpts(menuInContainer)
        }

        // Strategy 2: React Select portals the menu to <body> with a menuPortalTarget.
        // Find menus that are currently VISIBLE (display !== none, has options rendered).
        // The one we just opened should be visible; others should be hidden/removed.
        const allMenus = document.querySelectorAll(
          '[class*="select__menu"], [class*="dropdown-menu"], [role="listbox"]'
        )
        for (let i = allMenus.length - 1; i >= 0; i--) {
          const menu = allMenus[i]
          const style = window.getComputedStyle(menu)
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
          const menuOpts = Array.from(menu.querySelectorAll(
            '[class*="option"], [role="option"], li'
          ))
          if (menuOpts.length > 0) return filterOpts(menuOpts)
        }

        return []
      }, trigger)

      if (options.length > 0) {
        field.options = options
        log(`Click-to-discover: found ${options.length} options for "${field.label}": ${options.join(', ')}`)
      } else {
        log(`Click-to-discover: no options found for "${field.label}"`)
      }

      // Close the dropdown before moving to the next field
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      await page.click('body', { position: { x: 0, y: 0 } }).catch(() => {})
      await page.waitForTimeout(100)
    } catch (err) {
      log(`Click-to-discover: error for "${field.label}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
