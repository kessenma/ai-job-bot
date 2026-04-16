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

function cleanLocation(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/\((?:remote|hybrid|on[\s-]?site|in[\s-]?office)\)/gi, '')
    .replace(/\b(?:remote|hybrid|on[\s-]?site|in[\s-]?office)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim()
}

/**
 * Parse a freeform location string into structured country/state/city.
 *   "Berlin, Germany"              → { city: "Berlin", country: "Germany" }
 *   "San Francisco, CA"            → { city: "San Francisco", state: "California", country: "United States" }
 *   "New York, NY, United States"  → { city: "New York", state: "New York", country: "United States" }
 *   "Germany"                      → { country: "Germany" }
 *   "Remote"                       → {}
 */
export function parseLocation(raw: string): { country?: string; state?: string; city?: string } {
  const cleaned = cleanLocation(raw)
  if (!cleaned) return {}

  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return {}

  if (parts.length === 1) {
    return { country: parts[0] }
  }

  if (parts.length === 2) {
    const [first, second] = parts
    const stateUpper = second.toUpperCase()
    if (US_STATES[stateUpper]) {
      return { city: first, state: US_STATES[stateUpper], country: 'United States' }
    }
    return { city: first, country: second }
  }

  const last = parts[parts.length - 1]
  const middle = parts[parts.length - 2]
  const city = parts.slice(0, -2).join(', ')

  const middleUpper = middle.toUpperCase()
  if (US_STATES[middleUpper]) {
    return { city, state: US_STATES[middleUpper], country: last }
  }

  // For non-US locations, skip the state/region — it's rarely useful
  // and often just duplicates the city (e.g. "Vienna, Vienna, Austria")
  return { city, country: last }
}
