# Multi-Job-Board Support

**Source:** JobHuntr + JobSpy | **Priority:** Low → Medium (with JobSpy) | **Effort:** Medium (with JobSpy) / High (per custom board)

## What It Does

Scrapes jobs from Indeed, ZipRecruiter, Glassdoor, Google Jobs, Dice, and other job boards in addition to LinkedIn.

## Why Priority Changed

The original plan required building per-board Playwright scrapers from scratch (high effort). **JobSpy** (`apps/example-code/JobSpy`) already provides production-ready scrapers for 7+ boards with anti-bot handling, proxy rotation, and a unified output schema. Wrapping it in a microservice dramatically reduces effort.

## Current State

- LinkedIn search works via Playwright (`apps/playwright/src/search/`)
- No other board scrapers exist
- Google Sheets import serves as a manual universal import

## JobSpy Integration Plan

### Architecture: New Python Microservice

```
apps/jobspy/
├── Dockerfile
├── .dockerignore
├── requirements.txt
├── main.py              # FastAPI app
├── config.py            # Settings, proxy config
└── normalize.py         # Map JobSpy DataFrame → JobLead shape
```

Runs alongside the LLM service. The web app calls it via a new `jobspy.api.ts` adapter.

```
Web App
├── playwright.api.ts → Playwright Service (LinkedIn search, apply, scrape)
├── jobspy.api.ts     → JobSpy Service    (Indeed, Glassdoor, ZipRecruiter, Google Jobs)
└── llm.api.ts        → LLM Service       (scoring, cover letters)
```

### Step 1: JobSpy Service (`apps/jobspy/`)

**`main.py`** — FastAPI wrapper around `jobspy.scrape_jobs()`:

```python
from fastapi import FastAPI
from jobspy import scrape_jobs

app = FastAPI()

@app.post("/search")
def search_jobs(
    sites: list[str],           # ["indeed", "glassdoor", "zip_recruiter", "google"]
    search_term: str,
    location: str | None = None,
    distance: int = 50,
    is_remote: bool = False,
    job_type: str | None = None,
    results_wanted: int = 20,
    hours_old: int | None = None,
    country: str = "usa",
    proxies: list[str] | None = None,
):
    df = scrape_jobs(
        site_name=sites,
        search_term=search_term,
        location=location,
        distance=distance,
        is_remote=is_remote,
        job_type=job_type,
        results_wanted=results_wanted,
        hours_old=hours_old,
        country_indeed=country,
        proxies=proxies,
        description_format="markdown",
    )
    return normalize_to_job_leads(df)
```

**`normalize.py`** — Maps JobSpy's DataFrame columns to our `JobLead` / `LinkedInSearchResult` shape:

| JobSpy Column | Our Field |
|---|---|
| `title` | `role` |
| `company` | `company` |
| `location` | `location` (parse into `city`, `state`, `country`) |
| `job_url` | `jobUrl` |
| `site` | `source` (new field on JobLead) |
| `description` | feed to scrape pipeline or store directly |
| `min_amount`, `max_amount`, `interval`, `currency` | new `compensation` fields on JobLead |
| `is_remote` | `workType` |
| `date_posted` | `searchedAt` |
| `emails` | `recruiterEmail` |
| `job_type` | metadata |

### Step 2: Web App Adapter (`apps/web/src/lib/jobspy.api.ts`)

```typescript
// Server function that calls the JobSpy service
export const searchMultiBoard = createServerFn({ method: 'POST' })
  .validator(/* sites, searchTerm, location, etc. */)
  .handler(async ({ data }) => {
    const res = await fetch(`${JOBSPY_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.json() as Promise<JobLead[]>
  })
```

### Step 3: Schema Changes

Add to `packages/db/src/schema.ts`:

```typescript
// New fields on jobs table
source: text('source').default('linkedin'),  // 'linkedin' | 'indeed' | 'glassdoor' | etc.
salaryMin: integer('salary_min'),
salaryMax: integer('salary_max'),
salaryInterval: text('salary_interval'),     // 'yearly' | 'hourly' | etc.
salaryCurrency: text('salary_currency'),
```

Update `packages/shared/src/types.ts`:

```typescript
type JobSource = 'linkedin' | 'indeed' | 'glassdoor' | 'zip_recruiter' | 'google' | 'dice'

interface JobLead {
  // ... existing fields
  source?: JobSource
  salaryMin?: number
  salaryMax?: number
  salaryInterval?: string
  salaryCurrency?: string
}
```

### Step 4: UI — Multi-Board Scanner

New component `apps/web/src/components/scanners/MultiboardScanner.tsx`:

- Board selector (checkboxes for Indeed, Glassdoor, ZipRecruiter, Google Jobs)
- Shared search form (keywords, location, distance, job type, remote)
- Results table showing source board as a column
- "Save to Tracker" button that inserts to DB + Sheets like LinkedIn scanner

Add as a tab in the pipeline page alongside the LinkedIn scanner.

### Step 5: Docker Compose

```yaml
# docker-compose.playwright.yml
jobspy:
  build: ./apps/jobspy
  ports:
    - "8085:8085"
  environment:
    - PROXY_LIST=${PROXY_LIST:-}
```

## JobSpy Board Capabilities

| Board | Quality | Anti-Bot Risk | Notes |
|---|---|---|---|
| **Indeed** | Excellent | Medium | Best scraper in JobSpy, no rate limiting noted |
| **Glassdoor** | Good | Medium | GraphQL API, needs country token |
| **ZipRecruiter** | Good | Low | US/Canada focused, good salary data |
| **Google Jobs** | Good | Low | Aggregator, requires specific search syntax |
| **Bayt** | Niche | Low | Middle East jobs |
| **Naukri** | Niche | Low | India jobs, rich company data |

## What JobSpy Does NOT Replace

- **LinkedIn search** — our Playwright-based search is more sophisticated (login, Easy Apply integration, skill matching, SSE streaming, recordings)
- **Job description scraping** — our 29 ATS-specific selectors in `scrape/selectors.ts` are more targeted
- **Apply automation** — JobSpy is search-only, no application submission

## Deduplication Strategy

When merging results from multiple boards + LinkedIn:
1. Normalize company names (lowercase, strip "Inc.", "GmbH", etc.)
2. Match on `company + role title` fuzzy match
3. Match on `jobUrl` domain (same job on multiple boards often links to same ATS)
4. Keep the richest record (prefer the one with description, salary, recruiter contact)

## Prerequisites

- Proxy rotation support (see `docs/features/anti-bot-strategy.md`)
- Salary fields added to DB schema
- `source` field added to jobs table
