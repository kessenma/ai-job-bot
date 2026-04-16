# Duplicate / Already-Applied Detection

Prevents wasting time re-applying to the same job by detecting duplicates via URL matching and status checks.

## How It Works

1. `getAutoApplyCandidates()` in `job-filters.ts` tracks seen URLs and filters out duplicates
2. Jobs with statuses like "submitted", "applied", "rejected", or "interview" are excluded from the auto-apply queue
3. LinkedIn search import (`saveLinkedInSearchResults`) already checks for existing job URLs before inserting
4. An index on `job_url` in the jobs table speeds up these lookups

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/job-filters.ts` | `getAutoApplyCandidates()` — deduplicates by URL in the filter |
| `packages/db/src/migrate.ts` | `idx_jobs_job_url` index for fast URL lookups |
| `apps/web/src/lib/playwright.api.ts` | `saveLinkedInSearchResults()` — checks for existing URLs before insert |

## Dedup Logic

```typescript
const seenUrls = new Set<string>()
jobs.filter((j) => {
  if (seenUrls.has(j.jobUrl)) return false
  seenUrls.add(j.jobUrl)
  // ... other eligibility checks
})
```

## Integration Points

- The auto-apply page (`/auto-apply`) uses `getAutoApplyCandidates()` with dedup enabled
- LinkedIn search results skip insertion for jobs whose URL already exists in the database
- The dashboard shows status badges (Applied, Submitted, etc.) so users can visually identify already-applied jobs
