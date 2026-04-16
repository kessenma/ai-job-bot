import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react'
import { scrapeOneJobDescription, screenshotUrl, getJobDescriptions } from '#/lib/playwright.api.ts'
import { useBotStream, type BotStreamState } from '#/hooks/useBotStream.ts'
import type { JobLead, JobDescription } from '#/lib/types.ts'

const MAX_FAILURE_SCREENSHOTS = 20

export interface ScrapeFailure {
  jobUrl: string
  company: string
  role: string
  error: string
  screenshot?: string
}

interface DescScanState {
  active: boolean
  progress: { current: number; total: number; currentJob: string }
  results: {
    successes: { jobUrl: string; company: string; role: string }[]
    failures: ScrapeFailure[]
  } | null
  descMap: Record<string, JobDescription>
  /** Whether the descMap has been loaded from the server at least once */
  initialized: boolean
}

export type LinkedInScanStage = 'idle' | 'searching' | 'saving_db' | 'saving_sheet' | 'done' | 'error'

export interface LinkedInScanState {
  active: boolean
  stage: LinkedInScanStage
  stageLabel: string
  /** 0-1 normalized progress */
  progress: number
  savedCount?: number
  error?: string
  /** For find_matches mode: how many cards scanned so far */
  scannedSoFar?: number
  /** For find_matches mode: how many matches found so far */
  matchedSoFar?: number
}

interface ScanContextValue {
  descScan: DescScanState
  startDescScan: (jobs: JobLead[], mode: 'missing' | 'all') => Promise<void>
  cancelDescScan: () => void
  /** Initialize the descMap from server data (called by setup page loader) */
  initDescMap: (map: Record<string, JobDescription>) => void
  linkedInScan: LinkedInScanState
  setLinkedInScan: (update: Partial<LinkedInScanState>) => void
  /** SSE stream session ID — owned here so the EventSource survives route navigation */
  streamSessionId: string | null
  setStreamSessionId: (id: string | null) => void
  /** Live bot stream state from the SSE connection */
  botStream: BotStreamState
}

const ScanContext = createContext<ScanContextValue | null>(null)

export function useScanContext() {
  const ctx = useContext(ScanContext)
  if (!ctx) throw new Error('useScanContext must be used within ScanProvider')
  return ctx
}

const INITIAL_LINKEDIN_SCAN: LinkedInScanState = {
  active: false,
  stage: 'idle',
  stageLabel: '',
  progress: 0,
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [descScan, setDescScan] = useState<DescScanState>({
    active: false,
    progress: { current: 0, total: 0, currentJob: '' },
    results: null,
    descMap: {},
    initialized: false,
  })

  const [linkedInScan, setLinkedInScanState] = useState<LinkedInScanState>(INITIAL_LINKEDIN_SCAN)

  const setLinkedInScan = useCallback((update: Partial<LinkedInScanState>) => {
    setLinkedInScanState((prev) => ({ ...prev, ...update }))
  }, [])

  const [streamSessionId, setStreamSessionId] = useState<string | null>(null)
  const botStream = useBotStream(streamSessionId)

  const cancelledRef = useRef(false)
  const activeRef = useRef(false)

  const initDescMap = useCallback((map: Record<string, JobDescription>) => {
    setDescScan((prev) => {
      // Don't overwrite if a scan is active — the scan loop manages descMap during scans
      if (prev.active) return { ...prev, initialized: true }
      return { ...prev, descMap: map, initialized: true }
    })
  }, [])

  const startDescScan = useCallback(async (jobs: JobLead[], mode: 'missing' | 'all') => {
    if (activeRef.current) return
    activeRef.current = true
    cancelledRef.current = false

    // Fetch fresh descriptions from server before starting
    let currentMap: Record<string, JobDescription> = {}
    try {
      currentMap = await getJobDescriptions()
    } catch {
      // Fall back to what we have in state
      currentMap = descScan.descMap
    }

    const jobsWithUrls = jobs.filter((j) => j.jobUrl)
    const toScrape = mode === 'all'
      ? jobsWithUrls
      : jobsWithUrls.filter((j) => !currentMap[j.jobUrl])

    if (toScrape.length === 0) {
      activeRef.current = false
      setDescScan((prev) => ({ ...prev, descMap: currentMap, initialized: true }))
      return
    }

    const total = toScrape.length
    const successes: { jobUrl: string; company: string; role: string }[] = []
    const failures: ScrapeFailure[] = []

    setDescScan({
      active: true,
      progress: { current: 0, total, currentJob: '' },
      results: { successes: [], failures: [] },
      descMap: currentMap,
      initialized: true,
    })

    const updatedMap = { ...currentMap }

    for (let i = 0; i < toScrape.length; i++) {
      if (cancelledRef.current) break

      const job = toScrape[i]!
      const label = `${job.company} — ${job.role}`

      setDescScan((prev) => ({
        ...prev,
        progress: { current: i, total, currentJob: label },
      }))

      try {
        const result = await scrapeOneJobDescription({ data: { jobUrl: job.jobUrl } })
        updatedMap[job.jobUrl] = result
        successes.push({ jobUrl: job.jobUrl, company: job.company, role: job.role })
      } catch (e) {
        const failure: ScrapeFailure = {
          jobUrl: job.jobUrl,
          company: job.company,
          role: job.role,
          error: e instanceof Error ? e.message : 'Unknown error',
        }

        if (failures.filter((f) => f.screenshot).length < MAX_FAILURE_SCREENSHOTS) {
          try {
            const ss = await screenshotUrl({ data: { url: job.jobUrl } })
            failure.screenshot = ss.image
          } catch {
            // screenshot failed too, skip
          }
        }

        failures.push(failure)
      }

      setDescScan((prev) => ({
        ...prev,
        results: { successes: [...successes], failures: [...failures] },
        descMap: { ...updatedMap },
      }))
    }

    setDescScan((prev) => ({
      ...prev,
      active: false,
      progress: { current: total, total, currentJob: '' },
      descMap: { ...updatedMap },
    }))

    activeRef.current = false
  }, [descScan.descMap])

  const cancelDescScan = useCallback(() => {
    cancelledRef.current = true
  }, [])

  return (
    <ScanContext.Provider value={{ descScan, startDescScan, cancelDescScan, initDescMap, linkedInScan, setLinkedInScan, streamSessionId, setStreamSessionId, botStream }}>
      {children}
    </ScanContext.Provider>
  )
}
