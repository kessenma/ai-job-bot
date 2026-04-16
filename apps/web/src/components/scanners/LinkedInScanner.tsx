import { useState, useEffect, useCallback, useRef } from 'react'
import {
  MagnifyingGlass, CircleNotch, CheckCircle, ArrowSquareOut, Plus, Warning, Camera, ClockCounterClockwise,
  CaretDown, CaretUp, Play, Prohibit, Timer,
} from '@phosphor-icons/react'
import { searchLinkedInJobs, addLinkedInJobToTracker, saveLinkedInSearchResults, getLinkedInSearches, type LinkedInSearch } from '#/lib/playwright.api.ts'
import type { LinkedInSearchResult, LinkedInSearchMeta, LinkedInWorkType, LinkedInDatePosted } from '#/lib/types.ts'
import { StatCard } from '#/components/ui/index.ts'
import {
  Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty,
  ComboboxGroup, ComboboxLabel,
} from '#/components/ui/combobox.tsx'
import { COUNTRY_OPTIONS, fetchCitySuggestions } from '#/lib/location-suggestions.ts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { useScanContext } from '#/hooks/useScanContext.tsx'
import { BotViewerPanel, logLineColor } from '#/components/scanners/BotViewerPanel.tsx'

const STORAGE_KEY = 'linkedin-scanner'

interface SavedSearch {
  keywords: string
  city: string
  country: string
  skills: string
  workTypes?: LinkedInWorkType[]
  datePosted?: LinkedInDatePosted
  excludeGerman?: boolean
  searchedAt: string
}

function loadSaved(): { last: SavedSearch | null; history: SavedSearch[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { last: null, history: [] }
    return JSON.parse(raw)
  } catch {
    return { last: null, history: [] }
  }
}

function saveSearch(search: SavedSearch) {
  const data = loadSaved()
  data.last = search
  const currentWorkTypes = [...(search.workTypes || [])].sort().join(',')
  const previousWorkTypes = [...(data.history[0]?.workTypes || [])].sort().join(',')
  // Add to history if not a duplicate of the most recent
  const isDuplicate = data.history.length > 0 &&
    data.history[0].keywords === search.keywords &&
    data.history[0].city === search.city &&
    data.history[0].country === search.country &&
    previousWorkTypes === currentWorkTypes
  if (!isDuplicate) {
    data.history.unshift(search)
    data.history = data.history.slice(0, 10) // keep last 10
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function ServerLogsAccordion({ logs, defaultOpen = false }: { logs: string[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
      >
        {open ? <CaretUp className="h-3 w-3" /> : <CaretDown className="h-3 w-3" />}
        Server logs ({logs.length})
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-[var(--line)] bg-[#0a0a0a] p-3 font-mono text-[11px] leading-relaxed text-neutral-300">
          {logs.map((line, i) => (
            <div key={i} className={logLineColor(line)}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function PastSearchLogs({ logs }: { logs: string[] }) {
  return <ServerLogsAccordion logs={logs} />
}

function workTypeLabel(workType: LinkedInWorkType): string {
  if (workType === 'remote') return 'Remote'
  if (workType === 'hybrid') return 'Hybrid'
  return 'On-site'
}

const DATE_POSTED_OPTIONS: { value: LinkedInDatePosted; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'past_month', label: 'Past month' },
  { value: 'past_week', label: 'Past week' },
  { value: 'past_24h', label: 'Past 24h' },
]

export function LinkedInScanner() {
  const saved = loadSaved()
  const { linkedInScan, setLinkedInScan, setStreamSessionId, botStream } = useScanContext()
  const [keywords, setKeywords] = useState(saved.last?.keywords ?? '')
  const [city, setCity] = useState(saved.last?.city ?? '')
  const [country, setCountry] = useState(saved.last?.country ?? '')
  const [skills, setSkills] = useState(saved.last?.skills ?? '')
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<SavedSearch[]>(saved.history)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<LinkedInSearchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set())
  const [addingUrl, setAddingUrl] = useState<string | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [showScreenshot, setShowScreenshot] = useState(false)
  const [pastSearches, setPastSearches] = useState<LinkedInSearch[]>([])
  const [pastSearchesOpen, setPastSearchesOpen] = useState(false)
  const [expandedSearchId, setExpandedSearchId] = useState<number | null>(null)
  const [skillMatchOnly, setSkillMatchOnly] = useState(false)
  const [maxResults, setMaxResults] = useState(5)
  const [searchMode, setSearchMode] = useState<'scan' | 'find_matches'>('scan')
  const [minSkillMatch, setMinSkillMatch] = useState(1)
  const [searchLimit, setSearchLimit] = useState(50)
  const [exhaustResults, setExhaustResults] = useState(false)
  const [workTypes, setWorkTypes] = useState<LinkedInWorkType[]>(saved.last?.workTypes ?? [])
  const [datePosted, setDatePosted] = useState<LinkedInDatePosted>(saved.last?.datePosted ?? 'past_24h')
  const [excludeGerman, setExcludeGerman] = useState(saved.last?.excludeGerman ?? false)
  const [searchMeta, setSearchMeta] = useState<LinkedInSearchMeta | null>(null)
  const [serverLogs, setServerLogs] = useState<string[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [replaySearchId, setReplaySearchId] = useState<string | null>(null)
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)
  const [rateLimitTotal, setRateLimitTotal] = useState(0)
  const [rateLimitRemaining, setRateLimitRemaining] = useState(0)
  const cancelledRef = useRef(false)

  // Countdown timer for rate limiting
  useEffect(() => {
    if (!rateLimitUntil) return
    const tick = () => {
      const remaining = Math.max(0, rateLimitUntil - Date.now())
      setRateLimitRemaining(remaining)
      if (remaining <= 0) setRateLimitUntil(null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [rateLimitUntil])

  const [cityOptions, setCityOptions] = useState<{ value: string; label: string }[]>([])
  const cityDebounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const handleCityInput = useCallback(
    (val: string) => {
      setCity(val)
      if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current)
      if (!val.trim() || val.trim().length < 2) { setCityOptions([]); return }
      cityDebounceRef.current = setTimeout(async () => {
        const opts = await fetchCitySuggestions(val, country || undefined)
        setCityOptions(opts)
      }, 300)
    },
    [country],
  )

  const handleCancel = useCallback(() => {
    cancelledRef.current = true
    setSearching(false)
    setStreamSessionId(null)
    setLinkedInScan({ stage: 'error', stageLabel: 'Search cancelled', progress: 0, active: false, error: 'Cancelled' })
  }, [setLinkedInScan])

  // Load past searches on mount
  useEffect(() => {
    getLinkedInSearches().then(setPastSearches).catch(() => {})
  }, [])

  const refreshPastSearches = useCallback(() => {
    getLinkedInSearches().then(setPastSearches).catch(() => {})
  }, [])

  const toggleWorkType = (value: LinkedInWorkType) => {
    setWorkTypes((prev) => (
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    ))
  }

  const handleSearch = async () => {
    if (!keywords.trim()) return
    cancelledRef.current = false
    setSearching(true)
    setError(null)
    setResults(null)
    setAddedUrls(new Set())
    setScreenshot(null)
    setShowScreenshot(false)
    setServerLogs([])
    setLogsOpen(false)
    setReplaySearchId(null)
    const isFindMode = searchMode === 'find_matches'
    const searchLabel = isFindMode
      ? `Scanning LinkedIn for ${maxResults} matching jobs... this may take a minute`
      : 'Searching LinkedIn...'
    setLinkedInScan({ active: true, stage: 'searching', stageLabel: searchLabel, progress: 0.1, error: undefined, savedCount: undefined, scannedSoFar: undefined, matchedSoFar: undefined })
    setSearchMeta(null)
    try {
      const skillsArray = skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const location = [city.trim(), country.trim()].filter(Boolean).join(', ')
      const search: SavedSearch = { keywords, city, country, skills, workTypes, datePosted, excludeGerman, searchedAt: new Date().toISOString() }
      saveSearch(search)
      setHistory(loadSaved().history)

      // Generate a sessionId for SSE streaming — set it BEFORE firing the POST
      // so the EventSource connects and is ready to receive events
      const currentSessionId = crypto.randomUUID()
      setStreamSessionId(currentSessionId)

      const searchData = {
        keywords: keywords.trim(),
        location,
        skills: skillsArray,
        maxResults,
        mode: searchMode,
        targetMatches: isFindMode ? maxResults : undefined,
        minSkillMatch: isFindMode ? minSkillMatch : undefined,
        workTypes,
        datePosted,
        excludeGerman,
        searchLimit: isFindMode ? (exhaustResults ? 0 : searchLimit) : undefined,
        sessionId: currentSessionId,
      }

      // Small delay to let EventSource connect before the POST fires
      await new Promise((r) => setTimeout(r, 300))

      const res = await searchLinkedInJobs({ data: searchData })

      // Search is done — clear the stream session
      setStreamSessionId(null)

      // If user cancelled while we were waiting, discard results
      if (cancelledRef.current) return

      // Handle rate limiting — show countdown timer
      if (res.status === 'rate_limited') {
        const retryMs = res.retryAfterMs || 60000
        setRateLimitTotal(retryMs)
        setRateLimitUntil(Date.now() + retryMs)
        setLinkedInScan({ stage: 'idle', stageLabel: undefined, progress: 0, active: false })
        setSearching(false)
        return
      }

      if (res.logs?.length) setServerLogs(res.logs)
      if (res.status === 'ok') {
        setResults(res.results)
        if (res.meta) setSearchMeta(res.meta)
        if (res.screenshot) setScreenshot(res.screenshot)
        // Build a summary label
        const dupNote = res.meta?.skippedDuplicates ? `, ${res.meta.skippedDuplicates} duplicates skipped` : ''
        const deNote = res.meta?.skippedGerman ? `, ${res.meta.skippedGerman} German skipped` : ''
        const metaSummary = res.meta && isFindMode
          ? `Found ${res.meta.matchesFound}/${res.meta.targetMatches} matches (scanned ${res.meta.totalScanned} jobs${dupNote}${deNote})`
          : (res.meta?.skippedDuplicates || res.meta?.skippedGerman ? [res.meta?.skippedDuplicates ? `${res.meta.skippedDuplicates} duplicates skipped` : '', res.meta?.skippedGerman ? `${res.meta.skippedGerman} German skipped` : ''].filter(Boolean).join(', ') : undefined)
        // Persist results to local DB + Google Sheet
        if (res.results.length > 0) {
          const savingLabel = metaSummary
            ? `${metaSummary}. Saving ${res.results.length} jobs...`
            : `Saving ${res.results.length} jobs to database...`
          setLinkedInScan({ stage: 'saving_db', stageLabel: savingLabel, progress: 0.5, scannedSoFar: res.meta?.totalScanned, matchedSoFar: res.meta?.matchesFound })
          try {
            const saveResult = await saveLinkedInSearchResults({
              data: {
                results: res.results,
                searchKeywords: keywords.trim(),
                city: city.trim(),
                country: country.trim(),
                skills: skills.trim(),
                logs: res.logs,
                meta: res.meta,
                mode: searchMode,
                sessionId: currentSessionId || undefined,
              },
            })
            const doneLabel = metaSummary
              ? `${metaSummary} — ${saveResult.savedCount} new saved`
              : `Done — ${saveResult.savedCount} new jobs saved`
            setLinkedInScan({ stage: 'done', stageLabel: doneLabel, progress: 1, active: false, savedCount: saveResult.savedCount })
            refreshPastSearches()
          } catch (saveErr) {
            console.error('Failed to persist search results:', saveErr)
            setLinkedInScan({ stage: 'error', stageLabel: 'Search succeeded but failed to save results', progress: 1, active: false, error: saveErr instanceof Error ? saveErr.message : 'Save failed' })
          }
        } else {
          const emptyLabel = res.meta && isFindMode
            ? `No matches found after scanning ${res.meta.totalScanned} jobs${dupNote}`
            : (res.meta?.skippedDuplicates ? `No new results (${res.meta.skippedDuplicates} duplicates skipped)` : 'No results found')
          setLinkedInScan({ stage: 'done', stageLabel: emptyLabel, progress: 1, active: false })
        }
      } else {
        setError(res.message || 'Search failed')
        if (res.screenshot) setScreenshot(res.screenshot)
        if (res.logs?.length) setLogsOpen(true)
        setLinkedInScan({ stage: 'error', stageLabel: res.message || 'Search failed', progress: 0, active: false, error: res.message })
      }
    } catch (err) {
      setStreamSessionId(null)
      setError(err instanceof Error ? err.message : 'Search failed')
      setLinkedInScan({ stage: 'error', stageLabel: 'Search failed', progress: 0, active: false, error: err instanceof Error ? err.message : 'Search failed' })
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async (result: LinkedInSearchResult) => {
    setAddingUrl(result.url)
    try {
      await addLinkedInJobToTracker({
        data: {
          title: result.title,
          company: result.company,
          url: result.url,
          externalUrl: result.externalUrl || undefined,
          workType: result.workType,
          sponsorshipMentioned: result.sponsorshipMentioned,
          sponsorshipPolicy: result.sponsorshipPolicy,
          sponsorshipSnippet: result.sponsorshipSnippet,
          recruiterEmail: result.recruiterEmail || undefined,
          recruiterPhone: result.recruiterPhone || undefined,
          location: result.location,
        },
      })
      setAddedUrls((prev) => new Set([...prev, result.url]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add job')
    } finally {
      setAddingUrl(null)
    }
  }

  // Use streamed results while searching, finalized results when done
  const liveResults: LinkedInSearchResult[] | null = searching && botStream.results.length > 0
    ? botStream.results as LinkedInSearchResult[]
    : results

  const skillMatches = liveResults?.filter((r) => r.matchedSkills.length > 0).length ?? 0
  const displayResults = liveResults && skillMatchOnly ? liveResults.filter((r) => r.matchedSkills.length > 0) : liveResults

  const inputClass =
    'min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none disabled:opacity-50'

  return (
    <div>
      {/* Search form */}
      <div className="island-shell mb-6 rounded-2xl p-6">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Job Title / Keywords *</label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !searching && handleSearch()}
              placeholder="Python Developer"
              disabled={searching}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">City</label>
            <Combobox
              value={city}
              onValueChange={(v) => setCity(v ?? '')}
              onInputValueChange={handleCityInput}
              inputValue={city}
            >
              <ComboboxInput
                placeholder="Berlin"
                disabled={searching}
                className={inputClass}
                showTrigger={false}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !searching) handleSearch()
                }}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !searching) handleSearch()
                }}
              />
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxEmpty>No countries found.</ComboboxEmpty>
                  {COUNTRY_OPTIONS.filter((o) => o.group === 'DACH').length > 0 && (
                    <ComboboxGroup>
                      <ComboboxLabel>DACH</ComboboxLabel>
                      {COUNTRY_OPTIONS.filter((o) => o.group === 'DACH').map((opt) => (
                        <ComboboxItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </ComboboxItem>
                      ))}
                    </ComboboxGroup>
                  )}
                  {COUNTRY_OPTIONS.filter((o) => o.group === 'Other').length > 0 && (
                    <ComboboxGroup>
                      <ComboboxLabel>Other</ComboboxLabel>
                      {COUNTRY_OPTIONS.filter((o) => o.group === 'Other').map((opt) => (
                        <ComboboxItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </ComboboxItem>
                      ))}
                    </ComboboxGroup>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Skills (comma-separated)</label>
            <input
              type="text"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !searching && handleSearch()}
              placeholder="Python, React, TypeScript"
              disabled={searching}
              className={inputClass}
            />
          </div>
        </div>
        {/* Search mode toggle */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-0.5">
            <button
              onClick={() => setSearchMode('scan')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                searchMode === 'scan'
                  ? 'bg-[var(--lagoon)] text-white shadow-sm'
                  : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
              }`}
              disabled={searching}
            >
              Scan Top N
            </button>
            <button
              onClick={() => setSearchMode('find_matches')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                searchMode === 'find_matches'
                  ? 'bg-[var(--lagoon)] text-white shadow-sm'
                  : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
              }`}
              disabled={searching}
            >
              Find N Matches
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--sea-ink-soft)]">
              {searchMode === 'find_matches' ? 'Target matches' : 'Max results'}
            </label>
            <input
              type="number"
              min={1}
              max={25}
              value={maxResults}
              onChange={(e) => setMaxResults(Math.max(1, Math.min(25, parseInt(e.target.value) || 5)))}
              disabled={searching}
              className="w-16 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-center text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none disabled:opacity-50"
            />
          </div>
          {searchMode === 'find_matches' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-[var(--sea-ink-soft)]">Min skills</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={minSkillMatch}
                  onChange={(e) => setMinSkillMatch(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  disabled={searching}
                  className="w-16 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-center text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-[var(--sea-ink-soft)]">Search limit</label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={searchLimit}
                  onChange={(e) => setSearchLimit(Math.max(10, Math.min(500, parseInt(e.target.value) || 50)))}
                  disabled={searching || exhaustResults}
                  className="w-20 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-center text-sm text-[var(--sea-ink)] focus:border-[var(--lagoon)] focus:outline-none disabled:opacity-50"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--sea-ink-soft)]">
                <input
                  type="checkbox"
                  checked={exhaustResults}
                  onChange={(e) => setExhaustResults(e.target.checked)}
                  disabled={searching}
                  className="accent-[var(--lagoon)]"
                />
                Exhaust all results
              </label>
            </>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-[var(--sea-ink-soft)]">Work type</span>
            {(['remote', 'hybrid', 'onsite'] as LinkedInWorkType[]).map((workType) => {
              const active = workTypes.includes(workType)
              return (
                <button
                  key={workType}
                  onClick={() => toggleWorkType(workType)}
                  disabled={searching}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-[var(--lagoon)] bg-[var(--lagoon)]/10 text-[var(--lagoon-deep)]'
                      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]'
                  }`}
                >
                  {workTypeLabel(workType)}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-[var(--sea-ink-soft)]">Date posted</span>
            {DATE_POSTED_OPTIONS.map((opt) => {
              const active = datePosted === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setDatePosted(opt.value)}
                  disabled={searching}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-[var(--lagoon)] bg-[var(--lagoon)]/10 text-[var(--lagoon-deep)]'
                      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--sea-ink-soft)]">
            <input
              type="checkbox"
              checked={!excludeGerman}
              onChange={(e) => setExcludeGerman(!e.target.checked)}
              disabled={searching}
              className="accent-[var(--lagoon)]"
            />
            Include German
          </label>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSearch}
              disabled={searching || !keywords.trim() || (!!rateLimitUntil && rateLimitRemaining > 0)}
              className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            >
              {searching ? <CircleNotch className="h-4 w-4 animate-spin" /> : rateLimitUntil && rateLimitRemaining > 0 ? <Timer className="h-4 w-4" /> : <MagnifyingGlass className="h-4 w-4" />}
              {searching ? 'Searching LinkedIn...' : rateLimitUntil && rateLimitRemaining > 0 ? `Rate limited (${Math.floor(rateLimitRemaining / 60000)}:${String(Math.floor((rateLimitRemaining % 60000) / 1000)).padStart(2, '0')})` : 'Search LinkedIn'}
            </button>
            {searching && (
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <Prohibit className="h-4 w-4" />
                Cancel
              </button>
            )}
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
              >
                <ClockCounterClockwise className="h-3.5 w-3.5" />
                Recent
                {showHistory ? <CaretUp className="h-3.5 w-3.5" /> : <CaretDown className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
          {history.length > 0 && showHistory && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1">
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setKeywords(h.keywords)
                    setCity(h.city)
                    setCountry(h.country)
                    setSkills(h.skills)
                    setWorkTypes(h.workTypes || [])
                    setDatePosted(h.datePosted || 'past_24h')
                    setExcludeGerman(h.excludeGerman ?? false)
                    setShowHistory(false)
                  }}
                  className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-strong)]"
                >
                  <span className="text-sm font-medium text-[var(--sea-ink)]">{h.keywords}</span>
                  <span className="text-xs text-[var(--sea-ink-soft)]">
                    {[h.city, h.country].filter(Boolean).join(', ') || 'Any location'}
                    {h.workTypes?.length ? ` · ${h.workTypes.map(workTypeLabel).join(', ')}` : ''}
                    {h.skills ? ` · ${h.skills}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rate limit countdown */}
      {rateLimitUntil && rateLimitRemaining > 0 && (
        <div className="mb-6 island-shell rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800">
            <Timer className="h-4 w-4" />
            LinkedIn rate limit active
          </div>
          <p className="mb-3 text-xs text-amber-700">
            To avoid detection, searches are throttled. You can search again in:
          </p>
          <div className="flex items-center gap-3">
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-amber-200">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-amber-500 transition-all duration-1000 ease-linear"
                style={{ width: `${rateLimitTotal > 0 ? (1 - rateLimitRemaining / rateLimitTotal) * 100 : 0}%` }}
              />
            </div>
            <span className="min-w-[4rem] text-right font-mono text-sm font-semibold text-amber-800">
              {Math.floor(rateLimitRemaining / 60000)}:{String(Math.floor((rateLimitRemaining % 60000) / 1000)).padStart(2, '0')}
            </span>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {(linkedInScan.active || linkedInScan.stage === 'done' || linkedInScan.stage === 'error') && linkedInScan.stageLabel && (
        <div className="mb-6 island-shell rounded-xl p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-[var(--sea-ink)]">
              {linkedInScan.active && <CircleNotch className="h-4 w-4 animate-spin text-[var(--lagoon)]" />}
              {linkedInScan.stage === 'done' && <CheckCircle className="h-4 w-4 text-green-600" />}
              {linkedInScan.stage === 'error' && <Warning className="h-4 w-4 text-red-500" />}
              {linkedInScan.stageLabel}
            </span>
            {linkedInScan.active && (
              <span className="text-xs text-[var(--sea-ink-soft)]">{Math.round(linkedInScan.progress * 100)}%</span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-strong)]">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                linkedInScan.stage === 'error' ? 'bg-red-400' :
                linkedInScan.stage === 'done' ? 'bg-green-500' :
                'bg-[var(--lagoon)]'
              }`}
              style={{ width: `${Math.max(linkedInScan.progress * 100, linkedInScan.active ? 5 : 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Bot Viewer — live during search, replay for past searches */}
      {(searching || linkedInScan.active || replaySearchId) && (
        <BotViewerPanel
          stream={(searching || linkedInScan.active) ? botStream : undefined}
          replaySearchId={replaySearchId}
          isSearching={searching || linkedInScan.active}
        />
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <Warning className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {error.includes('auth_error') || error.includes('LINKEDIN_EMAIL')
              ? 'LinkedIn credentials not configured. Save them in Settings > LinkedIn, or set LINKEDIN_EMAIL and LINKEDIN_PASSWORD as fallback.'
              : error.includes('captcha')
                ? 'LinkedIn requires security verification. Try running the Playwright server with headless=false to complete login manually, then restart.'
                : error}
          </div>
        </div>
      )}

      {/* Debug Screenshot */}
      {screenshot && (
        <div className="mb-6">
          <button
            onClick={() => setShowScreenshot(!showScreenshot)}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--lagoon-deep)] hover:underline"
          >
            <Camera className="h-3 w-3" />
            {showScreenshot ? 'Hide' : 'Show'} page screenshot
          </button>
          {showScreenshot && (
            <div className="mt-2 overflow-hidden rounded-xl border border-[var(--line)]">
              <img
                src={`data:image/png;base64,${screenshot}`}
                alt="LinkedIn search page"
                className="w-full"
              />
            </div>
          )}
        </div>
      )}

      {/* Server Logs */}
      {serverLogs.length > 0 && (
        <div className="mb-6">
          <ServerLogsAccordion logs={serverLogs} defaultOpen={logsOpen} />
        </div>
      )}

      {/* Results */}
      {liveResults && (
        <>
          {/* Meta summary for find_matches mode */}
          {searchMeta && searchMeta.mode === 'find_matches' && (
            <div className="mb-3 rounded-lg border border-[var(--lagoon)]/20 bg-[var(--lagoon)]/5 px-4 py-2 text-sm text-[var(--sea-ink)]">
              Scanned <span className="font-semibold">{searchMeta.totalScanned}</span> of {searchMeta.totalLoaded} loaded jobs, found <span className="font-semibold">{searchMeta.matchesFound}</span> matching (target: {searchMeta.targetMatches})
            </div>
          )}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard value={searchMeta?.totalScanned ?? liveResults.length} label={searchMeta?.mode === 'find_matches' ? 'Jobs Scanned' : 'Jobs Found'} />
            <StatCard value={searchMeta?.totalAvailable ?? searchMeta?.totalLoaded ?? liveResults.length} label="Total Results" colorClass="bg-violet-500/10 text-violet-700" />
            <StatCard value={skillMatches} label="Skill Matches" colorClass="bg-green-500/10 text-green-700" />
            <StatCard value={addedUrls.size} label="Added to Tracker" colorClass="bg-blue-500/10 text-blue-700" />
            {skills.trim() && (
              <button
                onClick={() => setSkillMatchOnly(!skillMatchOnly)}
                className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2 text-sm transition ${
                  skillMatchOnly
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]'
                }`}
              >
                <span className="text-lg font-bold">{skillMatchOnly ? 'ON' : 'OFF'}</span>
                <span className="text-[10px] font-medium uppercase">Skill Filter</span>
              </button>
            )}
          </div>

          {(displayResults?.length ?? 0) === 0 ? (
            <div className="island-shell rounded-2xl p-6 text-center text-sm text-[var(--sea-ink-soft)]">
              {skillMatchOnly ? 'No jobs matched your skills. Turn off the skill filter to see all results.' : 'No jobs found matching your search. Try different keywords or location.'}
            </div>
          ) : (
            <div className="space-y-3">
              {displayResults!.map((r, i) => {
                const isAdded = addedUrls.has(r.url)
                const isAdding = addingUrl === r.url
                const isExpanded = expandedIdx === i
                return (
                  <div key={r.url} className="island-shell rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--sea-ink)]">{r.title || 'Untitled'}</span>
                          {r.matchScore && (
                            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                              {r.matchScore.matched}/{r.matchScore.total} skills
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-sm text-[var(--sea-ink-soft)]">
                          {r.company}{r.location ? ` \u00B7 ${r.location}` : ''}
                          {r.workType && r.workType !== 'unknown' ? ` \u00B7 ${r.workType}` : ''}
                        </div>

                        {r.sponsorshipMentioned && (
                          <div className="mt-1.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              r.sponsorshipPolicy === 'supports'
                                ? 'bg-green-100 text-green-700'
                                : r.sponsorshipPolicy === 'no_support'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                            >
                              {r.sponsorshipPolicy === 'supports' ? 'Sponsorship Mentioned (Supports)' : r.sponsorshipPolicy === 'no_support' ? 'Sponsorship Mentioned (No Support)' : 'Sponsorship Mentioned'}
                            </span>
                            {r.sponsorshipSnippet && (
                              <div className="mt-1 text-xs text-[var(--sea-ink-soft)]">{r.sponsorshipSnippet}</div>
                            )}
                          </div>
                        )}

                        {/* Skills pills */}
                        {(r.matchedSkills.length > 0 || r.missingSkills.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.matchedSkills.map((s) => (
                              <span key={s} className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">
                                {s}
                              </span>
                            ))}
                            {r.missingSkills.map((s) => (
                              <span key={s} className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Description preview */}
                        {r.description && (
                          <button
                            onClick={() => setExpandedIdx(isExpanded ? null : i)}
                            className="mt-2 text-left text-xs text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                          >
                            {isExpanded ? r.description : `${r.description.slice(0, 150)}...`}
                            <span className="ml-1 font-medium text-[var(--lagoon)]">
                              {isExpanded ? 'Show less' : 'Show more'}
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {r.externalUrl && (
                          <a
                            href={r.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--lagoon)] px-3 py-1 text-xs font-medium text-white no-underline hover:opacity-90"
                          >
                            <ArrowSquareOut className="h-3 w-3" />
                            Apply
                          </a>
                        )}
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--lagoon-deep)] no-underline hover:bg-[var(--surface-strong)]"
                        >
                          <ArrowSquareOut className="h-3 w-3" />
                          LinkedIn
                        </a>
                        <button
                          onClick={() => handleAdd(r)}
                          disabled={isAdded || isAdding}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                            isAdded
                              ? 'border border-green-200 bg-green-50 text-green-700'
                              : 'border border-[var(--lagoon)] text-[var(--lagoon-deep)] hover:bg-[var(--surface-strong)] disabled:opacity-50'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <CheckCircle className="h-3 w-3" />
                              Added
                            </>
                          ) : isAdding ? (
                            <CircleNotch className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-3 w-3" />
                              Add
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Past Searches */}
      <div className="mt-8">
        <button
          onClick={() => {
            setPastSearchesOpen(!pastSearchesOpen)
            if (!pastSearchesOpen) refreshPastSearches()
          }}
          className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--sea-ink)]"
        >
          <ClockCounterClockwise className="h-5 w-5 text-[var(--lagoon)]" />
          Past Searches{pastSearches.length > 0 ? ` (${pastSearches.length})` : ''}
          {pastSearchesOpen ? <CaretUp className="h-4 w-4 text-[var(--sea-ink-soft)]" /> : <CaretDown className="h-4 w-4 text-[var(--sea-ink-soft)]" />}
        </button>
        {pastSearchesOpen && (
          pastSearches.length === 0 ? (
            <div className="island-shell rounded-2xl p-6 text-center text-sm text-[var(--sea-ink-soft)]">
              No past searches yet. Run a LinkedIn search to see results here.
            </div>
          ) : (
            <div className="island-shell overflow-hidden rounded-2xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Keywords</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Skills</TableHead>
                    <TableHead className="text-right">Results</TableHead>
                    <TableHead className="text-right">Total Results</TableHead>
                    <TableHead className="text-right">New Saved</TableHead>
                    <TableHead>Sheet</TableHead>
                    <TableHead>Recording</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastSearches.map((s) => {
                    const resultsData: LinkedInSearchResult[] = (() => { try { return JSON.parse(s.results) } catch { return [] } })()
                    const pastLogs: string[] = (() => { try { return s.logs ? JSON.parse(s.logs) : [] } catch { return [] } })()
                    const isExpanded = expandedSearchId === s.id
                    return (
                      <>
                        <TableRow key={s.id} className="cursor-pointer" onClick={() => setExpandedSearchId(isExpanded ? null : s.id)}>
                          <TableCell className="text-xs text-[var(--sea-ink-soft)]">
                            {new Date(s.searchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell className="font-medium text-[var(--sea-ink)]">{s.keywords}</TableCell>
                          <TableCell className="text-[var(--sea-ink-soft)]">
                            {[s.city, s.country].filter(Boolean).join(', ') || '—'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-[var(--sea-ink-soft)]">
                            {s.skills || '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">{s.resultsCount}</TableCell>
                          <TableCell className="text-right">{s.totalAvailable ?? '—'}</TableCell>
                          <TableCell className="text-right">{s.savedCount}</TableCell>
                          <TableCell>
                            {s.savedToSheet ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <span className="text-xs text-[var(--sea-ink-soft)]">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {s.hasRecording ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setReplaySearchId(replaySearchId === String(s.id) ? null : String(s.id))
                                }}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                                  replaySearchId === String(s.id)
                                    ? 'bg-[var(--lagoon)] text-white'
                                    : 'border border-[var(--lagoon)] text-[var(--lagoon-deep)] hover:bg-[var(--surface-strong)]'
                                }`}
                              >
                                <Play className="h-3 w-3" />
                                {replaySearchId === String(s.id) ? 'Viewing' : 'Replay'}
                              </button>
                            ) : (
                              <span className="text-[10px] text-[var(--sea-ink-soft)]">Expired</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isExpanded ? <CaretUp className="h-3.5 w-3.5 text-[var(--sea-ink-soft)]" /> : <CaretDown className="h-3.5 w-3.5 text-[var(--sea-ink-soft)]" />}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (resultsData.length > 0 || pastLogs.length > 0) && (
                          <TableRow key={`${s.id}-detail`}>
                            <TableCell colSpan={10} className="bg-[var(--surface)] p-0">
                              <div className="space-y-2 p-4">
                                {resultsData.map((r) => (
                                  <div key={r.url} className="flex items-start justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium text-sm text-[var(--sea-ink)]">{r.title || 'Untitled'}</div>
                                      <div className="text-xs text-[var(--sea-ink-soft)]">
                                        {r.company}{r.location ? ` \u00B7 ${r.location}` : ''}
                                      </div>
                                      {(r.matchedSkills.length > 0 || r.missingSkills.length > 0) && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                          {r.matchedSkills.map((sk) => (
                                            <span key={sk} className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">{sk}</span>
                                          ))}
                                          {r.missingSkills.map((sk) => (
                                            <span key={sk} className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">{sk}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                      {r.externalUrl && (
                                        <a
                                          href={r.externalUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-1 rounded-full bg-[var(--lagoon)] px-2.5 py-1 text-xs font-medium text-white no-underline hover:bg-[var(--lagoon-deep)]"
                                        >
                                          <ArrowSquareOut className="h-3 w-3" />
                                          Apply
                                        </a>
                                      )}
                                      <a
                                        href={r.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--lagoon-deep)] no-underline hover:bg-[var(--surface)]"
                                      >
                                        <ArrowSquareOut className="h-3 w-3" />
                                        LinkedIn
                                      </a>
                                    </div>
                                  </div>
                                ))}
                                {pastLogs.length > 0 && (
                                  <PastSearchLogs logs={pastLogs} />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
