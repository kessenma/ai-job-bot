import type { Page } from 'playwright'
import { DROPDOWN_SYNONYMS } from './constants'

/**
 * Find the best matching option in a <select> element and select it.
 * Tries exact match, substring match, then keyword overlap scoring,
 * using synonym expansion from DROPDOWN_SYNONYMS.
 */
export async function selectBestOption(page: Page, selector: string, desiredValue: string): Promise<string | null> {
  try {
    const options = await page.evaluate((sel) => {
      const select = document.querySelector(sel) as HTMLSelectElement
      if (!select) return []
      return Array.from(select.options).map((opt) => ({
        value: opt.value,
        text: opt.textContent?.trim() || '',
      }))
    }, selector)

    if (options.length === 0) return null

    const desired = desiredValue.toLowerCase()

    // Build a list of all terms to match against (desired value + its synonyms)
    const matchTerms = [desired, ...(DROPDOWN_SYNONYMS[desired] ?? [])]

    // Try exact match first
    for (const term of matchTerms) {
      for (const opt of options) {
        const text = opt.text.toLowerCase()
        if (text === term || opt.value.toLowerCase() === term) {
          await page.selectOption(selector, opt.value)
          return opt.text
        }
      }
    }

    // Try substring match (both directions)
    for (const term of matchTerms) {
      for (const opt of options) {
        const text = opt.text.toLowerCase()
        if (text.includes(term) || term.includes(text)) {
          // Skip placeholder-like options
          if (!opt.value || opt.text === '' || opt.text === '—' || opt.text === '--') continue
          await page.selectOption(selector, opt.value)
          return opt.text
        }
      }
    }

    // Try keyword overlap scoring across all synonyms
    const allWords = matchTerms.flatMap((t) => t.split(/\W+/).filter(Boolean))
    let bestMatch = { score: 0, option: null as typeof options[0] | null }
    for (const opt of options) {
      if (!opt.value || opt.text === '' || opt.text === '—' || opt.text === '--') continue
      const text = opt.text.toLowerCase()
      const words = text.split(/\W+/).filter(Boolean)
      let score = 0
      for (const w of allWords) {
        if (words.some((ow) => ow.includes(w) || w.includes(ow))) score++
      }
      if (score > bestMatch.score) {
        bestMatch = { score, option: opt }
      }
    }

    if (bestMatch.option && bestMatch.score > 0) {
      await page.selectOption(selector, bestMatch.option.value)
      return bestMatch.option.text
    }

    return null
  } catch {
    return null
  }
}
