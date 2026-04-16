# Playwright Service Architecture

The Playwright service (`apps/playwright/`) is a stateless HTTP microservice built with Hono + Playwright running on Bun. It automates browser interactions for job searching, scraping, and application form filling.

## Module Layout

```
apps/playwright/src/
├── server.ts                    # Entry point: composes sub-routers, starts Hono server
├── browser.ts                   # Browser singletons (generic + LinkedIn persistent context)
│
├── shared/                      # Cross-cutting utilities used by multiple domains
│   ├── humanize.ts              # Human-like delays, typing, clicking, scrolling
│   ├── cookie-consent.ts        # Cookie consent banner dismissal (CMP APIs, shadow DOM)
│   ├── apply-button.ts          # Find & click "Apply" buttons (EN/DE patterns)
│   ├── form-filler.ts           # Generic form filling (label→field matching, dropdowns)
│   ├── page-status.ts           # CAPTCHA detection, URL probing, expired/blocked patterns
│   ├── linkedin-auth.ts         # LinkedIn login, session management, 2FA handling
│   ├── event-bus.ts             # In-memory pub/sub for SSE streaming (keyed by sessionId)
│   └── click-overlay.ts         # Visual annotations on screenshots (click targets, highlights)
│
├── search/                      # Job discovery + real-time streaming
│   ├── router.ts                # POST /linkedin-search, GET /linkedin-search/stream/:sessionId, GET /recordings/*
│   └── linkedin-helpers.ts      # Pure functions: work type inference, sponsorship detection, language detection, etc.
│
├── scrape/                      # Page inspection & data extraction
│   ├── router.ts                # POST /probe, /screenshot, /scrape-description
│   └── selectors.ts             # Job description CSS selectors for various ATS platforms
│
└── apply/                       # Application submission
    ├── router.ts                # POST /apply, /fill-form, /workday/*, /linkedin-easy-apply, /linkedin-login-test
    ├── linkedin-easy-apply.ts   # LinkedIn Easy Apply multi-step form automation
    └── handlers/                # ATS-specific form handlers
        ├── index.ts             # Handler registry + getHandler(url)
        ├── base.ts              # Types (ATSHandler, ApplyProfile, ApplyResult) + fillField, uploadFile
        ├── workday.ts           # Workday application flow
        ├── workday-utils.ts     # Workday dropdown/date field helpers
        ├── join.ts              # Join.com handler
        └── recruitee.ts         # Recruitee handler
```

## Domain Responsibilities

### `search/` — Job Discovery
Searches LinkedIn for jobs matching keywords, location, and work type filters. Extracts structured data from search results including:
- Job title, company, location, work type (remote/hybrid/onsite)
- External apply URLs (the employer's ATS/career page behind LinkedIn's "Apply" button)
- Recruiter contact info (email/phone)
- Visa sponsorship mentions
- Skills matching against user-provided skill list

**Dual URL tracking**: Each result produces two URLs:
- `url` (source URL) — the LinkedIn job listing where the job was discovered
- `externalUrl` (job URL) — the employer's actual apply page, extracted via a 3-stage process:
  1. **DOM scan** — checks apply-related links/buttons using broad CSS selectors; decodes LinkedIn redirect URLs (`/redir/redirect?url=...`, `externalApply?url=...`) to extract the real destination
  2. **Click + capture popup** — clicks the "Apply" button (skipping Easy Apply) and captures the popup URL that opens
  3. **Navigation fallback** — if clicking navigated the page itself, captures the external URL and navigates back

**Duplicate filtering**: The web app passes `knownJobs` (company+role pairs) and `knownUrls` (all existing jobUrl/sourceUrl values) from the database to the Playwright service. Before doing the expensive click+extract work on each card, the scraper checks if the job is already known — by URL match or case-insensitive company+role match — and skips it. Skipped duplicates are counted in `meta.skippedDuplicates` and surfaced in the UI.

**Language detection & filtering**: Each job description is run through `detectLanguage()` (in `linkedin-helpers.ts`) which classifies text as `en`, `de`, or `unknown` using word-frequency heuristics — common German function words (und, oder, für, wir, etc.) and English equivalents (the, and, you, requirements, etc.) are counted and compared, with German umlauts (ä, ö, ü, ß) as a tiebreaker. When `excludeGerman` is set in the search request, jobs detected as German are skipped before skills matching. The detected `language` is included in each result. Skipped count is tracked in `meta.skippedGerman`.

**"Share your profile?" modal dismissal**: LinkedIn may show a "Share your profile?" modal when clicking job cards or apply buttons. The search flow automatically detects this modal (by checking for a dialog containing "Share your profile" text) and dismisses it — first attempting the X/close button, falling back to toggling off the share switch and clicking Continue.

Supports two modes:
- **scan**: Return top N results from the first page
- **find_matches**: Keep scanning until N jobs meet minimum skill threshold, with automatic **pagination** — when all cards on the current page have been processed without meeting the target, the scraper scrolls for more cards and then clicks LinkedIn's "Next" button to load subsequent pages (up to 10 pages). Controlled by `searchLimit` (max cards to scan, 0 = exhaust all available) and `targetMatches` (stop once N matches are found). The UI exposes a "Search limit" input and an "Exhaust all results" checkbox

Supports **real-time streaming** via SSE when a `sessionId` is provided in the POST body. During execution, the search emits events (logs, progress updates, JPEG screenshots) through an in-memory event bus. Screenshots include visual click-target annotations (blue for "about to click", green for "extracting data") injected via DOM overlays. After completion, frames are persisted to disk under `data/recordings/{sessionId}/` with automatic cleanup (keeps last 10 recordings).

### `scrape/` — Page Inspection & Data Extraction
- **`/probe`**: Batch URL health check — detects expired listings, CAPTCHAs, blocked pages
- **`/screenshot`**: Navigate to URL, dismiss cookies, click Apply button, take screenshot
- **`/scrape-description`**: Extract job description text using ATS-specific CSS selectors

### `apply/` — Application Submission
- **`/apply`**: ATS-specific form submission via handler pattern (Workday, Join, Recruitee)
- **`/fill-form`**: Generic form filling using label-to-field matching (EN/DE)
- **`/workday/create-account`**: Workday account creation flow
- **`/workday/verify-and-signin`**: Workday email verification + sign-in
- **`/linkedin-easy-apply`**: LinkedIn Easy Apply multi-step questionnaire automation
- **`/linkedin-login-test`**: LinkedIn credential validation

### `shared/` — Cross-Cutting Utilities
Modules used by multiple domains:
- **humanize.ts**: Anti-detection — randomized delays, human-like typing speed, natural mouse movement
- **cookie-consent.ts**: Dismisses cookie banners via CMP JavaScript APIs, shadow DOM traversal, CSS selectors, and iframe inspection
- **form-filler.ts**: Maps form labels (EN/DE) to profile fields, handles dropdowns with synonym matching
- **page-status.ts**: CAPTCHA detection, URL probing with expired/blocked pattern matching
- **linkedin-auth.ts**: LinkedIn session management with 30-minute cache, 2FA push notification polling
- **event-bus.ts**: In-memory pub/sub for SSE streaming. Search handlers emit events keyed by `sessionId`; SSE endpoint subscribes and forwards events to connected clients. Sessions auto-cleanup 30s after completion.
- **click-overlay.ts**: Injects colored rectangle overlays at element bounding boxes via `page.evaluate()` before screenshots. Used to annotate what the bot is clicking or extracting. Blue = target (about to click), green = active (extracting data). Overlays are removed before actual interaction.

## Browser Lifecycle

```
browser.ts
├── getBrowser()          → Shared Chromium instance for generic (non-LinkedIn) requests
│                           Created on first request, reused across all scrape/apply endpoints
│
└── getLinkedInContext()  → Persistent browser context saved to disk (./data/linkedin-profile)
                            Preserves LinkedIn session cookies across server restarts
                            Login validity cached for 30 minutes (isLoginRecent())
```

Each HTTP request creates a new browser context (or page within the LinkedIn context) and closes it in `finally`. The service is stateless except for the LinkedIn session directory.

## Route Table

| Method | Path | Domain | Description |
|--------|------|--------|-------------|
| GET | `/health` | utility | Health check |
| GET | `/handlers` | utility | List available ATS handler names |
| POST | `/linkedin-search` | search | Search LinkedIn jobs with filtering (accepts optional `sessionId` for SSE streaming, `knownJobs`/`knownUrls` for dedup) |
| GET | `/linkedin-search/stream/:sessionId` | search | SSE stream of search events (logs, progress, screenshots) |
| GET | `/recordings/:searchId` | search | Recording metadata (frame list + timestamps) |
| GET | `/recordings/:searchId/:frame` | search | Individual JPEG frame from a recording |
| POST | `/probe` | scrape | Batch URL status check |
| POST | `/screenshot` | scrape | Take page screenshot with cookie/apply handling |
| POST | `/scrape-description` | scrape | Extract job description text |
| POST | `/apply` | apply | Submit via ATS handler |
| POST | `/fill-form` | apply | Fill generic application form |
| POST | `/workday/create-account` | apply | Create Workday account |
| POST | `/workday/verify-and-signin` | apply | Verify + sign in to Workday |
| POST | `/linkedin-easy-apply` | apply | LinkedIn Easy Apply automation |
| POST | `/linkedin-login-test` | apply | Test LinkedIn credentials |

## Adding a New ATS Handler

1. Create `apply/handlers/myats.ts` implementing the `ATSHandler` interface from `base.ts`
2. Add `canHandle(url)` with a regex matching the ATS domain
3. Implement `apply(page, url, profile)` with the form-filling logic
4. Register it in `apply/handlers/index.ts`:
   ```ts
   import { myatsHandler } from './myats.ts'
   export const handlers: ATSHandler[] = [..., myatsHandler]
   ```

## Submission Queue (Planned)

The apply routes support a dry-run workflow for the upcoming submission queue feature:

1. Web app calls `POST /fill-form` or `POST /linkedin-easy-apply { dryRun: true }`
2. Playwright fills the form, takes a screenshot, returns results **without submitting**
3. Web app saves results to `application_queue` table for user review
4. On approval, web app calls `POST /apply` or `POST /linkedin-easy-apply { dryRun: false }`

Persistence and queue management live in the web app (`packages/db`, `apps/web`). The Playwright service remains stateless — it only fills and optionally submits.

## Bot Viewer & Recordings

The bot viewer provides real-time visibility into what the headless browser is doing during LinkedIn searches. It works entirely through Docker with no VNC or display server required.

### Architecture

```
Browser ──EventSource──► Vite proxy ──► GET /linkedin-search/stream/:sessionId (SSE)
Browser ──serverFn────► Web server ──POST──► /linkedin-search { sessionId } (fires search)
```

1. The web app generates a `sessionId` (UUID) and opens an EventSource to the SSE endpoint via Vite proxy
2. The search POST handler receives the `sessionId` and emits events through the in-memory event bus
3. A background screenshot loop (~1.5s interval) captures JPEG frames during execution
4. Before clicking elements, colored overlays are injected to show click targets
5. The SSE endpoint subscribes to the event bus and streams events to the browser

### Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `log` | `{ message }` | Server log line |
| `progress` | `{ stage, progress }` | Stage name + 0-1 normalized progress |
| `screenshot` | `{ screenshot, label? }` | Base64 JPEG frame (quality 50, ~40-60KB) |
| `done` | `{ message }` | Search completed |
| `error` | `{ message }` | Search failed |

### Recording Retention

- After search completion, all frames are saved to `data/recordings/{sessionId}/` as numbered JPEGs + `meta.json`
- Only the **last 10 recordings** are kept; older ones are automatically deleted
- The `linkedin_searches` table has a `has_recording` flag to indicate whether a recording exists
- Past searches in the UI show a "Replay" button (with filmstrip playback) or "Expired" for old recordings

### Bandwidth

- JPEG quality 50 @ 1280×900: ~40-60KB per frame
- ~40-80 frames per 2-minute search: ~2-4MB total
- SSE is unidirectional and lightweight

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8084` | HTTP port |
| `DATA_DIR` | `./data` | Directory for persistent LinkedIn browser context |
| `LINKEDIN_EMAIL` | *(none)* | LinkedIn account email |
| `LINKEDIN_PASSWORD` | *(none)* | LinkedIn account password |

## Dependencies

- **hono** — HTTP framework
- **playwright** — Browser automation
- **Runtime**: Bun (not Node.js)
