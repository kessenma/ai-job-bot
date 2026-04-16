# Database Architecture

## Overview

SQLite is the **single source of truth**. Google Sheets acts as a write-only mirror for recruiter visibility. The web dashboard reads exclusively from SQLite.

```
Web App (dashboard, pipeline, settings)
  └─ jobs.server.ts → ensureDb() → SQLite

Data flows IN:
  - LinkedIn scraper → SQLite + Sheets mirror
  - Recruiter sheet import → SQLite (on-demand button)
  - Gmail scanner → SQLite

Data flows OUT:
  - Job Search tab on Google Sheets (write-only mirror)
```

## SQLite Database

**Location:** `DATA_DIR/job-app-bot.db` (default: `<cwd>/data/job-app-bot.db`)

Resolved via:
```
process.env.DATA_DIR || resolve(process.cwd(), 'data')
```

When running locally with `bun dev` from `apps/web/`, the DB ends up at `apps/web/data/job-app-bot.db`.

**WAL mode** is enabled (`PRAGMA journal_mode = WAL`), which creates two companion files:
- `job-app-bot.db-shm` — shared memory
- `job-app-bot.db-wal` — write-ahead log

> To fully reset the database, delete all three files: `rm data/job-app-bot.db*`
> Or use: `pnpm clear-db`

## Driver & ORM

- **ORM:** Drizzle (drizzle-orm + drizzle-orm/bun-sqlite)
- **Driver:** `bun:sqlite` (native Bun SQLite bindings)
- **Dual-driver support:** If `DATABASE_URL` is set, PostgreSQL is used instead (not currently active)
- **Schema:** `packages/db/src/schema.ts`
- **Driver:** `packages/db/src/drivers/bun-sqlite.ts`

## Tables

### `jobs` — Core job leads

The main table. Every job from any source lands here.

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| date | text | Date found |
| company | text | Not null |
| role | text | Job title |
| location | text | Raw freeform string (legacy) |
| country | text | Structured — optional |
| state | text | Structured — optional |
| city | text | Structured — optional |
| jobUrl | text | Employer's ATS/career page link |
| sourceUrl | text | Where the job was discovered (e.g. LinkedIn URL) |
| source | text | Origin: `'csv'`, `'sheets'`, `'linkedin'`, `'manual'` |
| atsPlatform | text | Detected ATS: recruitee, greenhouse, lever, etc. |
| suitabilityScore | integer | LLM-assigned 1–10 fit score |
| suitabilityReason | text | LLM explanation of score |
| recruiterLinkedin | text | |
| recruiterEmail | text | |
| recruiterPhone | text | |
| activityStatus | text | |
| alignmentStatus | text | |
| candidateRemarks | text | |
| applicationStatus | text | |
| followUpEmailStatus | text | |
| accountManagerRemarks | text | |
| searchedAt | text | ISO 8601 — when discovered |
| draftedAt | text | ISO 8601 — when application draft created |
| appliedAt | text | ISO 8601 — when application submitted |
| expiredAt | text | ISO 8601 — when job link found expired |
| respondedAt | text | ISO 8601 — when recruiter email response detected |
| createdAt | text | Auto-set on insert |
| updatedAt | text | Auto-set on insert |

**Indexes:** `company`, `application_status`, `job_url`

### `jobDescriptions` — Scraped job content

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| jobUrl | text | Unique, references the job |
| raw | text | Full scraped description |
| skills | text | LLM-parsed skills section |
| companyInfo | text | LLM-parsed company info |
| pay | text | LLM-parsed compensation info |
| other | text | LLM-parsed other sections |
| language | text | `'en'`, `'de'`, or `'unknown'` |
| scrapedAt | text | ISO 8601 |

**Indexes:** `job_url` (unique)

### `applicationQueue` — Pending applications for review

Dry-run results waiting for user approval before final submission.

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| jobId | integer | FK → jobs.id |
| jobUrl | text | Not null |
| company | text | Not null |
| role | text | |
| handler | text | Not null — `'fill-form'`, `'linkedin-easy-apply'`, `'workday'` |
| atsPlatform | text | Detected ATS platform |
| filledFields | text | JSON: `{ label, value, type }[]` |
| skippedFields | text | JSON: `string[]` |
| unansweredQuestions | text | JSON: `{ label, type, options?, required }[]` |
| stepsCompleted | integer | Number of form steps completed |
| screenshotId | integer | FK → screenshots.id |
| suitabilityScore | integer | LLM fit score at time of dry run |
| status | text | `pending` → `approved`/`rejected` → `submitted`/`failed`/`expired` |
| userEdits | text | JSON: `{ label, originalValue, newValue }[]` |
| failureReason | text | Why submission failed (if status=failed) |
| dryRunTimeMs | integer | How long the dry run took |
| reviewedAt | text | When user approved/rejected |
| submittedAt | text | When final submission happened |
| createdAt | text | Auto-set on insert |

**Indexes:** `status`, `job_id`

### `scannedEmails` — Gmail integration

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| messageId | text | Unique Gmail message ID |
| jobId | integer | FK → jobs.id |
| company | text | Not null — matched company name |
| from | text | Sender email address |
| subject | text | Email subject line |
| snippet | text | Email preview text |
| date | text | Email date |
| classification | text | `'rejection'`, `'interview'`, `'applied'`, `'other'` |
| matchedKeywords | text | JSON array of keywords that triggered classification |
| scannedAt | text | ISO 8601 |

**Indexes:** `company`, `classification`

### `uploads` — Resumes & cover letters

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| category | text | Not null — `'resume'` or `'cover-letter'` |
| name | text | Unique safe stored filename |
| originalName | text | Not null — original upload filename |
| extractedText | text | Extracted text content for LLM matching |
| uploadedAt | text | ISO 8601 |

**Indexes:** `category`

### `formQuestions` — Auto-fill deduplication

Tracks form questions across applications to learn answers over time.

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| jobUrl | text | URL of the job posting |
| jobId | integer | FK → jobs.id |
| platform | text | `'linkedin'`, `'recruitee'`, `'join'`, etc. |
| questionText | text | Not null — the actual question |
| questionHash | text | Not null — normalized hash for dedup |
| fieldType | text | `'text'`, `'select'`, `'radio'`, `'checkbox'` |
| options | text | JSON array of available options (for select/radio) |
| status | text | Not null — `'answered'`, `'unanswered'`, `'user_answered'` |
| answeredValue | text | The value used to answer |
| profileField | text | Which applyProfile field matched |
| occurrences | integer | How many times this question has been seen |
| firstSeenAt | text | ISO 8601 |
| lastSeenAt | text | ISO 8601 |

**Indexes:** `question_hash`, `status`, unique on `(question_hash, platform)`

### `applyErrors` — Application failure log

Tracks why applications failed (captcha, login expired, form stuck, timeout).

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| jobId | integer | FK → jobs.id |
| jobUrl | text | |
| handler | text | Not null — `'linkedin-easy-apply'`, `'fill-form'`, `'apply'` |
| errorType | text | Not null — `'no_easy_apply'`, `'captcha'`, `'login_expired'`, `'form_stuck'`, `'timeout'`, `'unknown'` |
| errorMessage | text | Human-readable error detail |
| screenshotId | integer | FK → screenshots.id |
| stepsCompleted | integer | How far the bot got before failing |
| dismissed | integer/bool | Whether user has dismissed/acknowledged this error |
| createdAt | text | ISO 8601 |

**Indexes:** `handler`, `error_type`, `dismissed`

### `applyProfile` — User's personal info for form filling

Single-row table with the user's details used to auto-fill application forms.

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| firstName | text | Not null |
| lastName | text | Not null |
| email | text | Not null |
| phoneCountryCode | text | `"+49"`, `"+1"`, etc. |
| phone | text | Number without country code |
| linkedinUrl | text | |
| city | text | |
| state | text | |
| country | text | |
| zipCode | text | |
| salaryExpectations | text | `"65,000-75,000 EUR"` |
| availability | text | `"Immediately"` / `"2 weeks"` / `"1 month"` / `"3 months"` |
| earliestStartDate | text | `"2026-04-01"` or `"As soon as possible"` |
| workVisaStatus | text | Expanded for US→DE/AT scenarios |
| nationality | text | `"US Citizen"` / `"EU Citizen"` etc. |
| gender | text | `"Male"` / `"Female"` / `"Non-binary"` / `"Prefer not to say"` |
| referralSource | text | `"LinkedIn"` / `"Company Website"` etc. |
| updatedAt | text | ISO 8601 |

### `screenshots` — Application workflow screenshots

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| jobId | integer | FK → jobs.id |
| url | text | Not null — page URL |
| image | text | Not null — base64 PNG |
| title | text | Page title |
| status | text | `'loaded'`, `'blocked'`, `'expired'`, `'error'` |
| hasCaptcha | integer/bool | Whether a CAPTCHA was detected |
| atsPlatform | text | Detected ATS |
| actions | text | JSON: `{ dismissedCookies, clickedApply, applyButtonText, navigatedTo }` |
| createdAt | text | ISO 8601 |

### `documentEmbeddings` — Vector embeddings for resume/job similarity

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| uploadName | text | Unique — references uploads.name |
| embedding | text | JSON array string (no native vector in SQLite) |
| model | text | Default `'all-MiniLM-L6-v2'` |
| embeddedAt | text | ISO 8601 |

**Indexes:** `upload_name`

### `jobCoverLetters` — Links uploaded cover letters to jobs

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| jobUrl | text | Unique, not null |
| uploadName | text | Not null — references uploads.name |
| createdAt | text | ISO 8601 |

**Indexes:** `job_url` (unique)

### `generatedCoverLetters` — LLM-generated cover letters

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| jobUrl | text | Nullable FK to jobs.job_url |
| company | text | Not null |
| role | text | Not null |
| style | text | Not null — `'classic'`, `'modern'` |
| content | text | Not null — the generated letter |
| modelUsed | text | LLM model that generated it |
| generationTimeS | text | Generation time in seconds (stored as text) |
| driveDocId | text | Google Drive document ID |
| driveUrl | text | Google Drive URL |
| createdAt | text | ISO 8601 |

**Indexes:** `job_url`

### `linkedinSearches` — Search history

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| keywords | text | Not null — search query |
| city | text | |
| country | text | |
| skills | text | Comma-separated skill filters |
| resultsCount | integer | Number of results returned |
| savedCount | integer | Number saved to DB |
| totalAvailable | integer | Total LinkedIn reported as available |
| results | text | JSON array of LinkedInSearchResult |
| logs | text | JSON array of server log strings |
| savedToSheet | integer/bool | Whether results were synced to Sheets |
| hasRecording | integer/bool | Whether a browser recording exists |
| searchedAt | text | ISO 8601 |

**Indexes:** `searched_at`

### `linkedinCredentials` — LinkedIn login

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| email | text | Not null |
| password | text | Not null |
| updatedAt | text | ISO 8601 |

### `jobPreferences` — Filtering rules

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| companyBlacklist | text | JSON array of company names to skip |
| titleBlacklist | text | JSON array of title keywords to skip |
| workType | text | `'remote'`, `'hybrid'`, `'onsite'`, `'any'` |
| salaryMin | integer | Minimum salary filter |
| salaryMax | integer | Maximum salary filter |
| salaryCurrency | text | Default `'EUR'` |
| minSuitabilityScore | integer | Default 5 — auto-apply threshold (1–10) |
| updatedAt | text | ISO 8601 |

### `syncLog` — Audit trail for sheet/gmail imports

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| source | text | Not null — `'sheets'`, `'gmail'` |
| status | text | Not null — `'success'`, `'error'` |
| jobsCount | integer | |
| emailsCount | integer | |
| error | text | Error message if status=error |
| syncedAt | text | ISO 8601 |

### `experienceEntries` — Work history for tailored applications

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| company | text | Not null |
| role | text | Not null |
| startDate | text | `"2022-01"` or ISO date |
| endDate | text | Null = current position |
| description | text | Not null — rich technical narrative |
| skills | text | JSON array of skill strings |
| sortOrder | integer | Display ordering |
| createdAt | text | ISO 8601 |
| updatedAt | text | ISO 8601 |

### `generatedResumes` — LLM-generated tailored resumes

| Column | Type | Notes |
|--------|------|-------|
| id | integer | Primary key, auto-increment |
| jobId | integer | FK → jobs.id |
| company | text | |
| role | text | |
| driveDocId | text | Google Drive document ID |
| driveUrl | text | Google Drive URL |
| resumeText | text | Generated resume content |
| createdAt | text | ISO 8601 |

## Migrations

Migrations run automatically on startup via `ensureDb()` (called before any DB query).

**Strategy:** Defensive, additive-only.
- `CREATE TABLE IF NOT EXISTS` for all tables
- `addColumnSafe()` wraps `ALTER TABLE ADD COLUMN` in try-catch (silently skips if column exists)
- No destructive migrations — columns are only added, never removed

**Files:**
- `packages/db/src/drivers/bun-sqlite.ts` — inline table creation + column migrations
- `packages/db/src/migrate.ts` — standalone migration runner (same logic, used outside web app)
- `packages/db/src/init.ts` — `ensureDb()` entry point (single-call guard)

## Google Sheets Integration

### Dual-write pattern

When jobs are found via LinkedIn scraper, they are:
1. Inserted into SQLite (primary)
2. Appended to the **"Job Search"** tab on Google Sheets (best-effort mirror)

The sheet write is fire-and-forget — if it fails, the job is still in SQLite.

### Job Search tab (unified)

Single tab replacing the old "job scrape" and "auto search" tabs. Columns:

```
Date Found | Platform | Company | Role | Country | State | City |
Job URL (Employer) | Source URL | Status | Score |
Searched | Drafted | Applied | Expired | Response |
Recruiter Email | Recruiter Phone |
Work Type | Sponsorship | Skills Matched | Skills Missing
```

### Recruiter sheet import

The recruiter maintains their own tab with job leads. Import is **on-demand** (button click), never automatic.

**Flow:**
1. Reads recruiter's tab via Sheets API v4
2. Auto-detects header row (scans first 30 rows for recognizable column names)
3. Maps 40+ header name variations to internal fields
4. Deduplicates by jobUrl, then by company+role
5. Inserts new jobs with `source: 'sheets'`
6. Logs to `syncLog` table

**Rule:** The recruiter's tab is **never written to**.

### Sheet config

Stored at `data/uploads/.sheet-config.json`:
```json
{ "url": "https://docs.google.com/spreadsheets/d/...", "sheetId": "abc123" }
```

Can also be set via `GOOGLE_SHEET_ID` env var.

## Resetting the Database

```bash
# Using the script (finds all DB files anywhere in the project)
pnpm clear-db

# Manual
rm data/job-app-bot.db*
```

Always restart the dev server after clearing — the bun process holds the DB connection in memory.
