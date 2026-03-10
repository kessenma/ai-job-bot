import { useState, useEffect, useCallback } from 'react'
import {
  MagnifyingGlass, CircleNotch, CheckCircle, ArrowSquareOut, Plus, Warning, Camera, ClockCounterClockwise,
  CaretDown, CaretUp,
} from '@phosphor-icons/react'
import { searchLinkedInJobs, addLinkedInJobToTracker, saveLinkedInSearchResults, getLinkedInSearches, type LinkedInSearch } from '#/lib/playwright.api.ts'
import type { LinkedInSearchResult } from '#/lib/types.ts'
import { StatCard } from '#/components/ui/index.ts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { useScanContext } from '#/hooks/useScanContext.tsx'

const STORAGE_KEY = 'linkedin-scanner'

interface SavedSearch {
  keywords: string
  city: string
  country: string
  skills: string
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
  // Add to history if not a duplicate of the most recent
  const isDuplicate = data.history.length > 0 &&
    data.history[0].keywords === search.keywords &&
    data.history[0].city === search.city &&
    data.history[0].country === search.country
  if (!isDuplicate) {
    data.history.unshift(search)
    data.history = data.history.slice(0, 10) // keep last 10
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function LinkedInScanner() {
  const saved = loadSaved()
  const { linkedInScan, setLinkedInScan } = useScanContext()
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

  // Load past searches on mount
  useEffect(() => {
    getLinkedInSearches().then(setPastSearches).catch(() => {})
  }, [])

  const refreshPastSearches = useCallback(() => {
    getLinkedInSearches().then(setPastSearches).catch(() => {})
  }, [])

  const handleSearch = async () => {
    if (!keywords.trim()) return
    setSearching(true)
    setError(null)
    setResults(null)
    setAddedUrls(new Set())
    setScreenshot(null)
    setShowScreenshot(false)
    setLinkedInScan({ active: true, stage: 'searching', stageLabel: 'Searching LinkedIn...', progress: 0.1, error: undefined, savedCount: undefined })
    try {
      const skillsArray = skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const location = [city.trim(), country.trim()].filter(Boolean).join(', ')
      const search: SavedSearch = { keywords, city, country, skills, searchedAt: new Date().toISOString() }
      saveSearch(search)
      setHistory(loadSaved().history)
      const res = await searchLinkedInJobs({ data: { keywords: keywords.trim(), location, skills: skillsArray, maxResults } })
      if (res.status === 'ok') {
        setResults(res.results)
        if (res.screenshot) setScreenshot(res.screenshot)
        // Persist results to local DB + Google Sheet
        if (res.results.length > 0) {
          setLinkedInScan({ stage: 'saving_db', stageLabel: `Saving ${res.results.length} jobs to database...`, progress: 0.5 })
          try {
            const saveResult = await saveLinkedInSearchResults({ data: { results: res.results, searchKeywords: keywords.trim(), city: city.trim(), country: country.trim(), skills: skills.trim() } })
            setLinkedInScan({ stage: 'done', stageLabel: `Done — ${saveResult.savedCount} new jobs saved`, progress: 1, active: false, savedCount: saveResult.savedCount })
            refreshPastSearches()
          } catch (saveErr) {
            console.error('Failed to persist search results:', saveErr)
            setLinkedInScan({ stage: 'error', stageLabel: 'Search succeeded but failed to save results', progress: 1, active: false, error: saveErr instanceof Error ? saveErr.message : 'Save failed' })
          }
        } else {
          setLinkedInScan({ stage: 'done', stageLabel: 'No results found', progress: 1, active: false })
        }
      } else {
        setError(res.message || 'Search failed')
        if (res.screenshot) setScreenshot(res.screenshot)
        setLinkedInScan({ stage: 'error', stageLabel: res.message || 'Search failed', progress: 0, active: false, error: res.message })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setLinkedInScan({ stage: 'error', stageLabel: 'Search failed', progress: 0, active: false, error: err instanceof Error ? err.message : 'Search failed' })
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async (result: LinkedInSearchResult) => {
    setAddingUrl(result.url)
    try {
      await addLinkedInJobToTracker({ data: { title: result.title, company: result.company, url: result.url, location: result.location } })
      setAddedUrls((prev) => new Set([...prev, result.url]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add job')
    } finally {
      setAddingUrl(null)
    }
  }

  const skillMatches = results?.filter((r) => r.matchedSkills.length > 0).length ?? 0
  const displayResults = results && skillMatchOnly ? results.filter((r) => r.matchedSkills.length > 0) : results

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
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !searching && handleSearch()}
              placeholder="Berlin"
              disabled={searching}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--sea-ink-soft)]">Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !searching && handleSearch()}
              placeholder="Germany"
              disabled={searching}
              className={inputClass}
            />
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
        <div className="mb-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--sea-ink-soft)]">Max results</label>
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
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSearch}
            disabled={searching || !keywords.trim()}
            className="flex items-center gap-2 rounded-lg bg-[var(--lagoon)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            {searching ? <CircleNotch className="h-4 w-4 animate-spin" /> : <MagnifyingGlass className="h-4 w-4" />}
            {searching ? 'Searching LinkedIn...' : 'Search LinkedIn'}
          </button>
          {history.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
              >
                <ClockCounterClockwise className="h-3.5 w-3.5" />
                Recent
              </button>
              {showHistory && (
                <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 shadow-lg">
                  {history.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setKeywords(h.keywords)
                        setCity(h.city)
                        setCountry(h.country)
                        setSkills(h.skills)
                        setShowHistory(false)
                      }}
                      className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-strong)]"
                    >
                      <span className="text-sm font-medium text-[var(--sea-ink)]">{h.keywords}</span>
                      <span className="text-xs text-[var(--sea-ink-soft)]">
                        {[h.city, h.country].filter(Boolean).join(', ') || 'Any location'}
                        {h.skills ? ` · ${h.skills}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <Warning className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {error.includes('auth_error') || error.includes('LINKEDIN_EMAIL')
              ? 'LinkedIn credentials not configured. Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD environment variables on the Playwright server.'
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

      {/* Results */}
      {results && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard value={results.length} label="Jobs Found" />
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
                        </div>
                        <div className="mt-0.5 text-sm text-[var(--sea-ink-soft)]">
                          {r.company}{r.location ? ` \u00B7 ${r.location}` : ''}
                        </div>

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
                    <TableHead className="text-right">New Saved</TableHead>
                    <TableHead>Sheet</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastSearches.map((s) => {
                    const resultsData: LinkedInSearchResult[] = (() => { try { return JSON.parse(s.results) } catch { return [] } })()
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
                          <TableCell className="text-right">{s.savedCount}</TableCell>
                          <TableCell>
                            {s.savedToSheet ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <span className="text-xs text-[var(--sea-ink-soft)]">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isExpanded ? <CaretUp className="h-3.5 w-3.5 text-[var(--sea-ink-soft)]" /> : <CaretDown className="h-3.5 w-3.5 text-[var(--sea-ink-soft)]" />}
                          </TableCell>
                        </TableRow>
                        {isExpanded && resultsData.length > 0 && (
                          <TableRow key={`${s.id}-detail`}>
                            <TableCell colSpan={8} className="bg-[var(--surface)] p-0">
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
