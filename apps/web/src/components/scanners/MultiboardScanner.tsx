import { useState, useCallback, useRef } from 'react'
import {
  MagnifyingGlass, CircleNotch, CheckCircle, ArrowSquareOut, Plus,
} from '@phosphor-icons/react'
import { searchMultiBoard, addJobBoardResultToTracker } from '#/lib/jobspy.api.ts'
import type { JobSpyResult } from '#/lib/types.ts'
import {
  Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty,
} from '#/components/ui/combobox.tsx'
import { COUNTRY_OPTIONS, fetchCitySuggestions } from '#/lib/location-suggestions.ts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '#/components/ui/select.tsx'
import { Button } from '#/components/ui/button.tsx'

const STORAGE_KEY = 'multiboard-scanner'

const BOARDS = [
  { value: 'indeed', label: 'Indeed' },
  { value: 'glassdoor', label: 'Glassdoor' },
  { value: 'zip_recruiter', label: 'ZipRecruiter' },
  { value: 'google', label: 'Google Jobs' },
  { value: 'bayt', label: 'Bayt' },
  { value: 'naukri', label: 'Naukri' },
] as const

const JOB_TYPE_OPTIONS = [
  { value: '', label: 'Any type' },
  { value: 'fulltime', label: 'Full-time' },
  { value: 'parttime', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
]

const HOURS_OLD_OPTIONS = [
  { value: '0', label: 'Any time' },
  { value: '24', label: 'Past 24h' },
  { value: '72', label: 'Past 3 days' },
  { value: '168', label: 'Past week' },
  { value: '720', label: 'Past 30 days' },
]

interface SavedParams {
  sites: string[]
  searchTerm: string
  location: string
  country: string
  savedAt: string
}

function loadSaved(): SavedParams | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function formatSalary(result: JobSpyResult): string {
  if (!result.salaryMin && !result.salaryMax) return ''
  const fmt = (n: number) => {
    if (n >= 1000) return `${Math.round(n / 1000)}k`
    return String(n)
  }
  const currency = result.salaryCurrency || '$'
  const interval = result.salaryInterval === 'yearly' ? '/yr' : result.salaryInterval === 'hourly' ? '/hr' : result.salaryInterval ? `/${result.salaryInterval}` : ''
  if (result.salaryMin && result.salaryMax) return `${currency}${fmt(result.salaryMin)}-${fmt(result.salaryMax)}${interval}`
  if (result.salaryMin) return `${currency}${fmt(result.salaryMin)}+${interval}`
  return `Up to ${currency}${fmt(result.salaryMax!)}${interval}`
}

function siteBadgeColor(site: string): string {
  switch (site) {
    case 'indeed': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    case 'glassdoor': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    case 'zip_recruiter': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
    case 'google': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    case 'bayt': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
    case 'naukri': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
  }
}

function siteLabel(site: string): string {
  return BOARDS.find((b) => b.value === site)?.label || site
}

export function MultiboardScanner() {
  const saved = loadSaved()
  const [sites, setSites] = useState<string[]>(saved?.sites ?? ['indeed', 'google'])
  const [searchTerm, setSearchTerm] = useState(saved?.searchTerm ?? '')
  const [location, setLocation] = useState(saved?.location ?? '')
  const [country, setCountry] = useState(saved?.country ?? '')
  const [distance, setDistance] = useState(50)
  const [isRemote, setIsRemote] = useState(false)
  const [jobType, setJobType] = useState('')
  const [resultsWanted, setResultsWanted] = useState(15)
  const [hoursOld, setHoursOld] = useState('0')

  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<JobSpyResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set())
  const [addingUrl, setAddingUrl] = useState<string | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const [cityOptions, setCityOptions] = useState<{ value: string; label: string }[]>([])
  const cityDebounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const handleCityInput = useCallback(
    (val: string) => {
      setLocation(val)
      if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current)
      if (!val.trim() || val.trim().length < 2) { setCityOptions([]); return }
      cityDebounceRef.current = setTimeout(async () => {
        const opts = await fetchCitySuggestions(val, country || undefined)
        setCityOptions(opts)
      }, 300)
    },
    [country],
  )

  const toggleSite = (site: string) => {
    setSites((prev) =>
      prev.includes(site) ? prev.filter((s) => s !== site) : [...prev, site],
    )
  }

  const handleSearch = async () => {
    if (!searchTerm.trim() || sites.length === 0) return
    setSearching(true)
    setError(null)
    setResults(null)
    setAddedUrls(new Set())
    setExpandedIdx(null)

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sites,
      searchTerm,
      location,
      country,
      savedAt: new Date().toISOString(),
    }))

    try {
      const locationStr = [location.trim(), country.trim()].filter(Boolean).join(', ')
      const res = await searchMultiBoard({
        data: {
          sites,
          searchTerm: searchTerm.trim(),
          location: locationStr || undefined,
          distance,
          isRemote,
          jobType: jobType || undefined,
          resultsWanted,
          hoursOld: hoursOld !== '0' ? parseInt(hoursOld) : undefined,
          country: country ? countryToJobSpy(country) : 'usa',
        },
      })
      setResults(res.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async (result: JobSpyResult) => {
    setAddingUrl(result.jobUrl)
    try {
      const res = await addJobBoardResultToTracker({
        data: {
          title: result.title,
          company: result.company,
          jobUrl: result.jobUrl,
          location: result.location,
          site: result.site,
        },
      })
      setAddedUrls((prev) => new Set([...prev, result.jobUrl]))
      if ('duplicate' in res && res.duplicate) {
        setError(`"${result.title}" at ${result.company} already exists in tracker`)
        setTimeout(() => setError(null), 3000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add job')
    } finally {
      setAddingUrl(null)
    }
  }

  const inputClass =
    'min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none disabled:opacity-50'

  return (
    <div>
      {/* Search form */}
      <div className="island-shell mb-6 rounded-2xl p-6">
        {/* Board selection */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-[var(--sea-ink-soft)]">Job Boards</label>
          <div className="flex flex-wrap gap-3">
            {BOARDS.map((board) => {
              const checked = sites.includes(board.value)
              return (
                <label key={board.value} className="flex items-center gap-1.5 text-sm text-[var(--sea-ink)]">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleSite(board.value)}
                    disabled={searching}
                  />
                  {board.label}
                </label>
              )
            })}
          </div>
        </div>

        {/* Search fields */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Keywords *</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !searching && handleSearch()}
              placeholder="Software Engineer"
              disabled={searching}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">City</label>
            <Combobox
              value={location}
              onValueChange={(v) => setLocation(v ?? '')}
              onInputValueChange={handleCityInput}
              inputValue={location}
            >
              <ComboboxInput
                placeholder="Berlin"
                disabled={searching}
                className={inputClass}
                showTrigger={false}
                onKeyDown={(e) => { if (e.key === 'Enter' && !searching) handleSearch() }}
              />
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxEmpty>No cities found.</ComboboxEmpty>
                  {cityOptions.map((opt) => (
                    <ComboboxItem key={opt.value + opt.label} value={opt.value}>
                      {opt.label}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Country</label>
            <Combobox
              value={country}
              onValueChange={(v) => setCountry(v ?? '')}
            >
              <ComboboxInput
                placeholder="Germany"
                disabled={searching}
                className={inputClass}
                showTrigger={false}
                onKeyDown={(e) => { if (e.key === 'Enter' && !searching) handleSearch() }}
              />
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxEmpty>No countries found.</ComboboxEmpty>
                  {COUNTRY_OPTIONS.map((opt) => (
                    <ComboboxItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Distance (mi)</label>
            <input
              type="number"
              min={5}
              max={200}
              value={distance}
              onChange={(e) => setDistance(parseInt(e.target.value) || 50)}
              disabled={searching}
              className={inputClass}
            />
          </div>
        </div>

        {/* Filters row */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--sea-ink-soft)]">Job type</label>
            <Select value={jobType} onValueChange={(v) => setJobType(v ?? '')} disabled={searching}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Any type" />
              </SelectTrigger>
              <SelectContent>
                {JOB_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--sea-ink-soft)]">Posted</label>
            <Select value={hoursOld} onValueChange={(v) => setHoursOld(v ?? '0')} disabled={searching}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS_OLD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--sea-ink-soft)]">Results</label>
            <input
              type="number"
              min={1}
              max={50}
              value={resultsWanted}
              onChange={(e) => setResultsWanted(Math.max(1, Math.min(50, parseInt(e.target.value) || 15)))}
              disabled={searching}
              className="w-16 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-center text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none disabled:opacity-50"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--sea-ink-soft)]">
            <Checkbox
              checked={isRemote}
              onCheckedChange={(checked) => setIsRemote(checked === true)}
              disabled={searching}
            />
            Remote only
          </label>
        </div>

        {/* Search button */}
        <Button
          onClick={handleSearch}
          disabled={searching || !searchTerm.trim() || sites.length === 0}
          className="bg-[var(--lagoon)] text-white hover:opacity-90"
        >
          {searching ? <CircleNotch className="mr-2 h-4 w-4 animate-spin" /> : <MagnifyingGlass className="mr-2 h-4 w-4" />}
          {searching ? `Searching ${sites.length} board${sites.length > 1 ? 's' : ''}...` : 'Search Job Boards'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          <p className="mb-3 text-sm text-[var(--sea-ink-soft)]">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </p>

          {results.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Source</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Salary</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, idx) => {
                    const added = addedUrls.has(result.jobUrl)
                    const adding = addingUrl === result.jobUrl
                    const expanded = expandedIdx === idx
                    return (
                      <TableRow
                        key={result.jobUrl + idx}
                        className="cursor-pointer hover:bg-[var(--surface-strong)]"
                        onClick={() => setExpandedIdx(expanded ? null : idx)}
                      >
                        <TableCell>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${siteBadgeColor(result.site)}`}>
                            {siteLabel(result.site)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium text-[var(--sea-ink)]">{result.title}</span>
                            {result.isRemote && (
                              <Badge variant="outline" className="ml-1.5 text-[10px]">Remote</Badge>
                            )}
                          </div>
                          {expanded && result.description && (
                            <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[var(--sea-ink-soft)]">
                              {result.description.slice(0, 1000)}
                              {result.description.length > 1000 && '...'}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-[var(--sea-ink)]">{result.company}</TableCell>
                        <TableCell className="text-sm text-[var(--sea-ink-soft)]">{result.location}</TableCell>
                        <TableCell className="text-sm text-[var(--sea-ink-soft)]">{formatSalary(result)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {result.jobUrl && (
                              <a
                                href={result.jobUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded p-1 text-[var(--sea-ink-soft)] hover:text-[var(--lagoon)]"
                                title="Open job posting"
                              >
                                <ArrowSquareOut className="h-4 w-4" />
                              </a>
                            )}
                            {added ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <button
                                onClick={() => handleAdd(result)}
                                disabled={adding || !result.jobUrl}
                                className="rounded p-1 text-[var(--lagoon)] hover:bg-[var(--lagoon)]/10 disabled:opacity-50"
                                title="Add to tracker"
                              >
                                {adding ? (
                                  <CircleNotch className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Map display country name to JobSpy country code */
function countryToJobSpy(country: string): string {
  const map: Record<string, string> = {
    'United States': 'usa',
    'United Kingdom': 'uk',
    'Germany': 'germany',
    'Austria': 'austria',
    'Switzerland': 'switzerland',
    'Canada': 'canada',
    'Australia': 'australia',
    'France': 'france',
    'Netherlands': 'netherlands',
    'India': 'india',
    'Singapore': 'singapore',
    'Japan': 'japan',
    'Brazil': 'brazil',
    'Mexico': 'mexico',
    'Spain': 'spain',
    'Italy': 'italy',
    'Poland': 'poland',
    'Sweden': 'sweden',
    'Ireland': 'ireland',
    'Belgium': 'belgium',
    'Denmark': 'denmark',
    'Norway': 'norway',
    'Finland': 'finland',
    'Czech Republic': 'czech republic',
    'Portugal': 'portugal',
    'Romania': 'romania',
    'Hungary': 'hungary',
    'New Zealand': 'new zealand',
    'South Korea': 'south korea',
    'Israel': 'israel',
    'South Africa': 'south africa',
    'United Arab Emirates': 'united arab emirates',
  }
  return map[country] || country.toLowerCase()
}
