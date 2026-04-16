export type LinkedInWorkType = 'remote' | 'hybrid' | 'onsite'

export const LINKEDIN_WORK_TYPE_TO_CODE: Record<LinkedInWorkType, string> = {
  onsite: '1',
  remote: '2',
  hybrid: '3',
}

export type LinkedInDatePosted = 'any' | 'past_month' | 'past_week' | 'past_24h'

export const LINKEDIN_DATE_POSTED_TO_CODE: Record<LinkedInDatePosted, string | null> = {
  any: null,
  past_month: 'r2592000',
  past_week: 'r604800',
  past_24h: 'r86400',
}

export function parseLinkedInResultsCount(raw: string): number | undefined {
  const cleaned = raw.replace(/,/g, '')
  const match = cleaned.match(/(\d+)/)
  if (!match) return undefined
  const parsed = parseInt(match[1], 10)
  if (Number.isNaN(parsed) || parsed <= 0) return undefined
  return parsed
}

export function extractRecruiterContacts(raw: string): { recruiterEmail?: string; recruiterPhone?: string } {
  if (!raw) return {}

  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const recruiterEmail = emailMatch?.[0]

  const phoneCandidates = raw.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) || []
  const recruiterPhone = phoneCandidates
    .map((candidate) => candidate.trim())
    .find((candidate) => {
      const digits = candidate.replace(/\D/g, '')
      return digits.length >= 8 && digits.length <= 15
    })

  return { recruiterEmail, recruiterPhone }
}

export function inferWorkType(...sources: string[]): 'remote' | 'hybrid' | 'onsite' | 'unknown' {
  const text = sources.join(' ').toLowerCase()
  if (/\bhybrid\b/.test(text)) return 'hybrid'
  if (/\bremote\b/.test(text)) return 'remote'
  if (/\bon[\s-]?site\b|\bin[\s-]?office\b/.test(text)) return 'onsite'
  return 'unknown'
}

export function cleanLocation(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/\((?:remote|hybrid|on[\s-]?site|in[\s-]?office)\)/gi, '')
    .replace(/\b(?:remote|hybrid|on[\s-]?site|in[\s-]?office)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim()
}

// US state abbreviation → full name
const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
}

/**
 * Parse a freeform location string into structured country/state/city.
 * Handles common LinkedIn formats:
 *   "Berlin, Germany"           → { city: "Berlin", country: "Germany" }
 *   "San Francisco, CA"        → { city: "San Francisco", state: "California", country: "United States" }
 *   "New York, NY, United States" → { city: "New York", state: "New York", country: "United States" }
 *   "Germany"                   → { country: "Germany" }
 *   "Remote"                    → {}
 */
export function parseLocation(raw: string): { country?: string; state?: string; city?: string } {
  const cleaned = cleanLocation(raw)
  if (!cleaned) return {}

  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return {}

  if (parts.length === 1) {
    // Could be just a country or just a city — treat as country
    return { country: parts[0] }
  }

  if (parts.length === 2) {
    const [first, second] = parts
    // Check if second part is a US state abbreviation
    const stateUpper = second.toUpperCase()
    if (US_STATES[stateUpper]) {
      return { city: first, state: US_STATES[stateUpper], country: 'United States' }
    }
    // Otherwise: "City, Country" (EU-style)
    return { city: first, country: second }
  }

  // 3+ parts: "City, State/Region, Country"
  const last = parts[parts.length - 1]
  const middle = parts[parts.length - 2]
  const city = parts.slice(0, -2).join(', ')

  // Check if middle is a US state abbreviation
  const middleUpper = middle.toUpperCase()
  if (US_STATES[middleUpper]) {
    return { city, state: US_STATES[middleUpper], country: last }
  }

  return { city, state: middle, country: last }
}

export type DetectedLanguage = 'en' | 'de' | 'unknown'

/**
 * Detect whether text is primarily English or German using common word frequency.
 * Returns 'de' if German signal is strong, 'en' if English signal is strong, else 'unknown'.
 */
export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.length < 30) return 'unknown'
  const lower = text.toLowerCase()

  // Common German words unlikely to appear in English job descriptions
  const deWords = [
    'und', 'oder', 'für', 'wir', 'mit', 'die', 'der', 'den', 'das', 'ein', 'eine', 'einen',
    'ist', 'sind', 'wird', 'werden', 'haben', 'hat', 'auf', 'bei', 'zur', 'zum', 'vom',
    'über', 'nach', 'ihre', 'deine', 'unser', 'unsere', 'auch', 'sich', 'nicht',
    'stellenanzeige', 'aufgaben', 'anforderungen', 'bewerbung', 'bewerben',
    'berufserfahrung', 'kenntnisse', 'mindestens', 'erfahrung',
    'arbeiten', 'bieten', 'suchen', 'stelle', 'unternehmen',
  ]
  // Common English words unlikely in German
  const enWords = [
    'the', 'and', 'you', 'your', 'our', 'with', 'this', 'that', 'will', 'are',
    'have', 'has', 'from', 'they', 'been', 'their', 'about', 'would', 'which',
    'requirements', 'responsibilities', 'experience', 'skills', 'qualifications',
    'looking', 'team', 'role', 'position', 'opportunity', 'candidate',
    'ability', 'strong', 'preferred', 'required', 'working',
  ]

  const wordBoundary = (w: string) => new RegExp(`\\b${w}\\b`, 'g')

  let deScore = 0
  let enScore = 0
  for (const w of deWords) {
    const matches = lower.match(wordBoundary(w))
    if (matches) deScore += matches.length
  }
  for (const w of enWords) {
    const matches = lower.match(wordBoundary(w))
    if (matches) enScore += matches.length
  }

  // German-specific characters as a signal boost
  const umlautCount = (lower.match(/[äöüß]/g) || []).length
  deScore += umlautCount * 0.5

  if (deScore > enScore && deScore >= 3) return 'de'
  if (enScore > deScore && enScore >= 3) return 'en'
  return 'unknown'
}

export function detectSponsorship(raw: string): {
  sponsorshipMentioned: boolean
  sponsorshipPolicy: 'supports' | 'no_support' | 'unknown'
  sponsorshipSnippet?: string
} {
  if (!raw) return { sponsorshipMentioned: false, sponsorshipPolicy: 'unknown' }

  const supportRegex = /\b(visa sponsorship|sponsorship available|sponsorship provided|work permit support|we (can|will) sponsor|sponsor (your )?visa|eligible for sponsorship)\b/i
  const noSupportRegex = /\b(no (visa )?sponsorship|cannot sponsor|unable to sponsor|do not sponsor|without sponsorship|must have (existing )?right to work|no work permit sponsorship|not provide sponsorship)\b/i

  const support = supportRegex.exec(raw)
  const noSupport = noSupportRegex.exec(raw)

  const firstMatch = (() => {
    if (support && noSupport) return support.index <= noSupport.index ? support : noSupport
    return support || noSupport
  })()

  if (!firstMatch) return { sponsorshipMentioned: false, sponsorshipPolicy: 'unknown' }

  const snippetStart = Math.max(0, firstMatch.index - 90)
  const snippetEnd = Math.min(raw.length, firstMatch.index + firstMatch[0].length + 130)
  const sponsorshipSnippet = raw.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim()

  if (noSupport) {
    return { sponsorshipMentioned: true, sponsorshipPolicy: 'no_support', sponsorshipSnippet }
  }
  if (support) {
    return { sponsorshipMentioned: true, sponsorshipPolicy: 'supports', sponsorshipSnippet }
  }
  return { sponsorshipMentioned: true, sponsorshipPolicy: 'unknown', sponsorshipSnippet }
}
