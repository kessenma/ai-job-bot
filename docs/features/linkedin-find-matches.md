# LinkedIn "Find N Matches" Search Mode

Adds a second search strategy to the LinkedIn scanner that keeps scanning through job results until it finds N jobs matching your skills, instead of just scanning the top N and hoping some match.

## Search Modes

### Scan Top N (default)
Original behavior. Extracts the first N job cards from LinkedIn search results and returns all of them with skill match info. All results are saved regardless of whether they match your skills.

### Find N Matches (new)
Iterates through ALL loaded job cards (~25 on a LinkedIn search page) and only collects jobs that match at least a minimum number of your specified skills. Stops early once the target number of matches is reached. Only matched jobs are saved.

**Parameters:**
- **Target matches** — how many matching jobs you want (replaces "Max results" label)
- **Min skills** — minimum number of skills that must match for a job to be included (default: 1)

## How It Works

1. User selects "Find N Matches" mode via segmented toggle in the search form
2. LinkedIn search runs normally (keywords, location, last 24 hours)
3. Backend scrolls the results page (6 iterations instead of 3) to load more cards
4. Iterates through ALL loaded cards, clicking each to load its description
5. Checks description + title against the skill list
6. Only keeps jobs where `matchedSkills.length >= minSkillMatch`
7. Stops when `results.length >= targetMatches` or all cards exhausted
8. Returns results with `meta` containing scan statistics

## API

### `POST /linkedin-search` (updated)

**New request fields:**
```json
{
  "keywords": "Software Engineer",
  "location": "Berlin, Germany",
  "skills": ["TypeScript", "React", "Next.js"],
  "maxResults": 5,
  "mode": "find_matches",
  "targetMatches": 5,
  "minSkillMatch": 2
}
```

**New response fields:**
```json
{
  "status": "ok",
  "results": [
    {
      "title": "Frontend Engineer",
      "company": "Acme Corp",
      "matchedSkills": ["TypeScript", "React"],
      "missingSkills": ["Next.js"],
      "matchScore": { "matched": 2, "total": 3 },
      "..."
    }
  ],
  "meta": {
    "mode": "find_matches",
    "totalScanned": 18,
    "totalLoaded": 25,
    "matchesFound": 5,
    "targetMatches": 5
  }
}
```

The `matchScore` field is included in both modes. The `meta` object is always present.

## UI Changes

- **Segmented toggle**: "Scan Top N" / "Find N Matches" in the search form
- **Dynamic labels**: "Max results" becomes "Target matches" in find_matches mode
- **Min skills input**: Appears when find_matches mode is selected
- **Meta summary bar**: Shows "Scanned 18 of 25 loaded jobs, found 5 matching (target: 5)"
- **Match score badge**: Blue pill on each result showing "2/3 skills"
- **Stat cards**: "Jobs Found" becomes "Jobs Scanned" in find_matches mode

## Key Files

| File | Purpose |
|------|---------|
| `apps/playwright/src/linkedin.ts` | Backend mode branching in card iteration loop |
| `apps/web/src/components/scanners/LinkedInScanner.tsx` | UI: mode toggle, meta display, match score badges |
| `apps/web/src/lib/playwright.api.ts` | API layer: new params, longer timeout (180s) |
| `packages/shared/src/types.ts` | `matchScore`, `LinkedInSearchMode`, `LinkedInSearchMeta` types |

## Performance

- **Scan Top N**: Same as before (~25s for 5 jobs on authenticated page)
- **Find N Matches**: Up to ~75s scanning all 25 cards (each click + description load ~3s)
- Timeout increased to 180s for find_matches mode
- Existing `humanDelay` between clicks prevents rate limiting

## Edge Cases

- **No skills provided** in find_matches mode: falls back to scan behavior
- **Zero matches** after scanning all cards: returns empty results with meta showing how many were scanned
- **Fewer cards loaded** than expected: loop naturally handles this since it iterates `cards.length`
