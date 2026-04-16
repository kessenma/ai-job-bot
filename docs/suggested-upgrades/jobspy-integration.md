# JobSpy Integration

**Source:** [JobSpy](https://github.com/Bunsly/JobSpy) (`apps/example-code/JobSpy`) | **Priority:** Medium | **Effort:** Medium

JobSpy is a Python job scraping library that aggregates job postings from 8 job boards into a unified pandas DataFrame. It provides several features that can be adopted into the job-app-bot either directly (via a new microservice) or by porting patterns into existing services.

## Reference Code

- **JobSpy source:** `apps/example-code/JobSpy/jobspy/`
- **Main API:** `jobspy/__init__.py` — `scrape_jobs()` entry point
- **Data models:** `jobspy/model.py` — Pydantic schemas for jobs, compensation, location
- **Utilities:** `jobspy/util.py` — proxy rotation, salary parsing, email extraction, session management
- **Per-board scrapers:** `jobspy/linkedin/`, `jobspy/indeed/`, `jobspy/glassdoor/`, `jobspy/ziprecruiter/`, `jobspy/google/`, `jobspy/bayt/`, `jobspy/naukri/`, `jobspy/bdjobs/`

## Related Docs

- [`docs/suggested-upgrades/multi-job-board.md`](../suggested-upgrades/multi-job-board.md) — Full implementation plan for the JobSpy microservice, schema changes, and UI
- [`docs/features/anti-bot-strategy.md`](../features/anti-bot-strategy.md) — Proxy rotation and humanization strategy (references JobSpy's approach)

---

## Feature 1: Multi-Board Job Search

**What JobSpy provides:** Ready-made scrapers for Indeed, ZipRecruiter, Glassdoor, Google Jobs, Bayt, Naukri, and BDJobs — all returning a standardized DataFrame with a single `scrape_jobs()` call.

**Current state:** We only search LinkedIn via Playwright.

**Integration approach:** Wrap JobSpy in a new FastAPI microservice (`apps/jobspy/`). The web app calls it via `jobspy.api.ts`, results get normalized to our `JobLead` type and saved to DB + Sheets alongside LinkedIn results.

**Key reference files:**
- `jobspy/__init__.py` — `scrape_jobs()` uses `ThreadPoolExecutor` to fan out across boards
- `jobspy/indeed/__init__.py` — Indeed GraphQL scraper (best quality)
- `jobspy/glassdoor/__init__.py` — Glassdoor GraphQL + token auth
- `jobspy/ziprecruiter/__init__.py` — ZipRecruiter HTML parser

**Full plan:** See [`docs/suggested-upgrades/multi-job-board.md`](../suggested-upgrades/multi-job-board.md)

---

## Feature 2: Salary Extraction & Normalization

**What JobSpy provides:** Robust regex-based salary parsing that handles multiple formats and normalizes across pay intervals.

**Current state:** Our `JobDescription` type has a `pay` string field extracted from descriptions, but no structured salary data (min/max/interval/currency).

**Integration approach:** Adopt JobSpy's `Compensation` model into our schema and either:
- (A) Use the JobSpy service output which already includes structured salary data, or
- (B) Port the salary extraction logic to TypeScript for use in our scrape pipeline

**Key reference files:**
- `jobspy/model.py` — `Compensation` Pydantic model:
  ```python
  class Compensation:
      interval: CompensationInterval  # yearly, monthly, weekly, daily, hourly
      min_amount: float
      max_amount: float
      currency: str  # "USD", "EUR", etc.
  ```
- `jobspy/util.py` — `extract_salary()` function:
  - Regex patterns for `$XX - $YY per hour/year`, `$XXk-$YYk`, `€XX.XXX`, etc.
  - Handles hourly → annual conversion (`enforce_annual_salary` flag)
  - Currency detection from symbols and codes
  - Per-board salary utilities in `jobspy/indeed/util.py`, `jobspy/glassdoor/util.py`

**Schema changes needed:**
```typescript
// packages/db/src/schema.ts — new columns on jobs table
salaryMin: integer('salary_min'),
salaryMax: integer('salary_max'),
salaryInterval: text('salary_interval'),   // 'yearly' | 'monthly' | 'hourly'
salaryCurrency: text('salary_currency'),   // 'USD' | 'EUR' | etc.
```

---

## Feature 3: Proxy Rotation & Anti-Bot

**What JobSpy provides:** `RotatingProxySession` with TLS client support for bypassing anti-bot measures, plus automatic retry with exponential backoff.

**Current state:** Our Playwright service uses humanization delays (`humanize.ts`) but no proxy rotation. Works for low-volume LinkedIn use but won't scale to multiple boards.

**Integration approach:** Hybrid strategy — JobSpy handles its own proxy rotation for multi-board scraping, Playwright gets proxy support via native `chromium.launch({ proxy })` config. Both read from a shared `PROXY_LIST` env var.

**Key reference files:**
- `jobspy/util.py` — Three proxy classes:
  - `RotatingProxySession` — round-robin proxy selection from a list
  - `RequestsRotating` — `requests.Session` subclass, rotates per request
  - `TLSRotating` — `tls_client.Session` subclass with TLS fingerprint spoofing + rotation
- `jobspy/util.py` — `create_session()` factory that picks TLS vs standard, configures retries and CA certs

**Full plan:** See [`docs/features/anti-bot-strategy.md`](../features/anti-bot-strategy.md)

---

## Feature 4: Email Extraction from Descriptions

**What JobSpy provides:** Regex-based recruiter email extraction from job description text, returned as an `emails` column in the output DataFrame.

**Current state:** We extract recruiter emails during LinkedIn search via `extractRecruiterContacts()` in `apps/playwright/src/search/linkedin-helpers.ts`, but only from LinkedIn job cards — not from scraped descriptions on other platforms.

**Integration approach:** Port JobSpy's email extraction or extend our existing `extractRecruiterContacts()` to run on all scraped descriptions, not just LinkedIn cards.

**Key reference files:**
- `jobspy/util.py` — `extract_emails_from_text()`:
  ```python
  def extract_emails_from_text(text: str) -> list[str]:
      # Regex for standard email patterns
      # Filters out common false positives (image extensions, noreply, etc.)
  ```
- Our existing: `apps/playwright/src/search/linkedin-helpers.ts` — `extractRecruiterContacts()` already handles email + phone regex

**Implementation:** Add a post-processing step in the scrape pipeline (`apps/playwright/src/scrape/router.ts`) that runs email extraction on every scraped description and updates the job's `recruiterEmail` field if found.

```typescript
// In /scrape-description handler, after extracting description text:
const emails = extractRecruiterContacts(descriptionText)
if (emails.email) {
  // Update job record with discovered recruiter email
}
```

---

## Feature 5: Concurrent Multi-Board Scraping

**What JobSpy provides:** `ThreadPoolExecutor`-based parallel scraping across all specified boards. A single `scrape_jobs()` call fans out to Indeed + Glassdoor + ZipRecruiter + Google simultaneously.

**Current state:** We only search one board (LinkedIn) sequentially. Adding more boards without concurrency would multiply search time linearly.

**Integration approach:** This comes for free with the JobSpy microservice — `scrape_jobs()` already parallelizes internally. On the web app side, we can also parallelize by calling LinkedIn (Playwright) and multi-board (JobSpy) searches simultaneously.

**Key reference files:**
- `jobspy/__init__.py`:
  ```python
  with ThreadPoolExecutor(max_workers=len(scrapers)) as executor:
      future_to_site = {
          executor.submit(scraper.scrape, scraper_input): site
          for site, scraper in scrapers.items()
      }
  ```

**Web app parallelization:**
```typescript
// apps/web/src/lib/search.api.ts
export async function searchAllBoards(params) {
  const [linkedinResults, multiboardResults] = await Promise.all([
    startLinkedInSearchStream(params),       // Playwright service
    searchMultiBoard(params),                // JobSpy service
  ])
  return deduplicateResults([...linkedinResults, ...multiboardResults])
}
```

---

## Implementation Priority

| # | Feature | Effort | Value | Depends On |
|---|---|---|---|---|
| 1 | Multi-board search | Medium | High | JobSpy service setup |
| 2 | Salary extraction | Low | Medium | Schema migration |
| 3 | Proxy rotation | Low-Medium | High | Proxy provider account |
| 4 | Email extraction | Low | Low | Nothing |
| 5 | Concurrent scraping | Free | Medium | Feature 1 |

**Recommended order:** 3 → 1 (includes 5) → 2 → 4

Set up proxy rotation first since it benefits both LinkedIn (existing) and multi-board (new). Then build the JobSpy service which gives you multi-board + concurrency. Salary normalization and email extraction are incremental additions after that.
