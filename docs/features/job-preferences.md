# Job Preferences & Blacklist Filtering

Lets users configure filtering rules to exclude unwanted jobs from the auto-apply queue.

## Features

### Company Blacklist
Exclude jobs from specific companies. Matched by case-insensitive substring (e.g., "Acme" matches "Acme Corp").

### Title Keyword Blacklist
Exclude jobs whose title contains certain keywords (e.g., "intern", "manager", "senior").

### Min Suitability Score Threshold
Jobs scored by the LLM below this threshold are excluded from auto-apply. Default: 5/10. Adjustable via slider (1-10).

## Database Table: `job_preferences`

| Column | Description |
|--------|-------------|
| `company_blacklist` | JSON array of company names to exclude |
| `title_blacklist` | JSON array of title keywords to exclude |
| `work_type` | `remote`, `hybrid`, `onsite`, or `any` |
| `salary_min` / `salary_max` | Salary range filter |
| `salary_currency` | Default: EUR |
| `min_suitability_score` | 1-10 threshold for auto-apply (default: 5) |

## Key Files

| File | Purpose |
|------|---------|
| `packages/db/src/schema.ts` | `jobPreferences` table definition |
| `apps/web/src/lib/preferences.api.ts` | Server functions: `getJobPreferences`, `saveJobPreferences` |
| `apps/web/src/lib/job-filters.ts` | `getAutoApplyCandidates()` applies preference filters; `isBlacklisted()` helper |
| `apps/web/src/components/settings/JobPreferencesSection.tsx` | UI for managing preferences |
| `apps/web/src/routes/settings.tsx` | Preferences section wired into settings page |

## UI

The "Job Preferences" section on the Settings page includes:

- **Company Blacklist** — tag-style chips with add/remove; type a company name and press Enter
- **Title Keyword Blacklist** — same tag UI for title keywords
- **Min Suitability Score** — range slider (1-10) with live preview
- **Save button** — persists to database

## Filtering Flow

```
getAutoApplyCandidates(jobs, preferences)
  └─ Base eligibility (not expired, not applied, has URL)
  └─ Dedup by URL
  └─ isBlacklisted(job, prefs) → checks company + title blacklists
  └─ Score threshold check → suitabilityScore >= minSuitabilityScore
```

The auto-apply page loads preferences and passes them to `getAutoApplyCandidates()` so the queue only shows eligible, non-blacklisted jobs.
