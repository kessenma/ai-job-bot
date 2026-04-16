export interface ComboboxOption {
  value: string
  label: string
  group?: string
}

// DACH + common European countries — DACH pinned first
const DACH_COUNTRIES = ['Germany', 'Austria', 'Switzerland']
const OTHER_COUNTRIES = [
  'Albania', 'Andorra', 'Armenia', 'Azerbaijan', 'Belarus', 'Belgium', 'Bosnia and Herzegovina',
  'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France',
  'Georgia', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kazakhstan', 'Kosovo', 'Latvia',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Monaco', 'Montenegro',
  'Netherlands', 'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'Russia',
  'San Marino', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Turkey', 'Ukraine',
  'United Kingdom', 'Vatican City',
  // Non-European but commonly searched
  'United States', 'Canada', 'Australia', 'New Zealand', 'Singapore', 'Japan', 'South Korea',
  'India', 'Brazil', 'Mexico', 'United Arab Emirates', 'Israel', 'South Africa',
]

export const COUNTRY_OPTIONS: ComboboxOption[] = [
  ...DACH_COUNTRIES.map((c) => ({ value: c, label: c, group: 'DACH' })),
  ...OTHER_COUNTRIES.map((c) => ({ value: c, label: c, group: 'Other' })),
]

// Nominatim city autocomplete (free, 1 req/sec)
let lastFetchTime = 0

export async function fetchCitySuggestions(query: string, country?: string): Promise<ComboboxOption[]> {
  if (!query.trim() || query.trim().length < 2) return []

  // Respect rate limit
  const now = Date.now()
  const wait = Math.max(0, 1000 - (now - lastFetchTime))
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastFetchTime = Date.now()

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '8',
    featuretype: 'city',
    ...(country ? { countrycodes: countryToCode(country) || '' } : {}),
  })

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'Accept-Language': 'en' },
  })
  if (!res.ok) return []

  const data: NominatimResult[] = await res.json()
  // Deduplicate by city name
  const seen = new Set<string>()
  return data
    .filter((r) => r.type === 'city' || r.type === 'town' || r.type === 'village' || r.type === 'administrative' || r.class === 'place')
    .map((r) => {
      const city = r.address?.city || r.address?.town || r.address?.village || r.name
      const region = r.address?.state || ''
      const countryName = r.address?.country || ''
      const label = [city, region, countryName].filter(Boolean).join(', ')
      return { value: city, label }
    })
    .filter((o) => {
      if (seen.has(o.value.toLowerCase())) return false
      seen.add(o.value.toLowerCase())
      return true
    })
}

interface NominatimResult {
  name: string
  type: string
  class: string
  address?: {
    city?: string
    town?: string
    village?: string
    state?: string
    country?: string
  }
}

// Minimal country name → ISO 3166-1 alpha-2 for Nominatim filtering
const COUNTRY_CODES: Record<string, string> = {
  germany: 'de', austria: 'at', switzerland: 'ch',
  belgium: 'be', bulgaria: 'bg', croatia: 'hr', cyprus: 'cy',
  'czech republic': 'cz', denmark: 'dk', estonia: 'ee', finland: 'fi',
  france: 'fr', greece: 'gr', hungary: 'hu', iceland: 'is', ireland: 'ie',
  italy: 'it', latvia: 'lv', liechtenstein: 'li', lithuania: 'lt',
  luxembourg: 'lu', malta: 'mt', netherlands: 'nl', norway: 'no',
  poland: 'pl', portugal: 'pt', romania: 'ro', slovakia: 'sk',
  slovenia: 'si', spain: 'es', sweden: 'se', 'united kingdom': 'gb',
  'united states': 'us', canada: 'ca', australia: 'au', 'new zealand': 'nz',
  singapore: 'sg', japan: 'jp', 'south korea': 'kr', india: 'in',
  brazil: 'br', mexico: 'mx', 'united arab emirates': 'ae', israel: 'il',
  'south africa': 'za', turkey: 'tr', ukraine: 'ua', russia: 'ru',
  serbia: 'rs', 'bosnia and herzegovina': 'ba', albania: 'al',
  'north macedonia': 'mk', montenegro: 'me', kosovo: 'xk', moldova: 'md',
  georgia: 'ge', armenia: 'am', azerbaijan: 'az', belarus: 'by',
  kazakhstan: 'kz', andorra: 'ad', monaco: 'mc', 'san marino': 'sm',
  'vatican city': 'va',
}

function countryToCode(name: string): string | undefined {
  return COUNTRY_CODES[name.toLowerCase()]
}
