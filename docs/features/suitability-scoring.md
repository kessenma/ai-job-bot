# LLM Job Suitability Scoring

Uses the local LLM to score how well each job matches the candidate's resume and profile on a 1-10 scale.

## How It Works

1. User clicks "Score Fit" on a job in the dashboard detail sheet
2. The web app sends the job description + resume text + profile summary to the LLM service
3. The LLM returns a 1-10 score with a brief reason
4. The score is saved to the `jobs` table and displayed in the UI

## LLM Endpoint: `POST /score-job`

**Request:**
```json
{
  "job_description": "...",
  "company": "Acme Corp",
  "role": "Software Engineer",
  "resume_text": "...",
  "profile_summary": "Location: Berlin, Germany\nSalary: 65,000-75,000 EUR\n..."
}
```

**Response:**
```json
{
  "score": 8,
  "reason": "Strong match — TypeScript and React experience aligns well with the role requirements.",
  "generation_time_s": 4.2
}
```

The prompt instructs the LLM to respond with JSON: `{"score": <1-10>, "reason": "..."}`. A regex fallback extracts the score if JSON parsing fails.

## Database Columns

Added to the `jobs` table:
- `suitability_score` (INTEGER) — 1-10
- `suitability_reason` (TEXT) — brief explanation from the LLM

## Key Files

| File | Purpose |
|------|---------|
| `apps/llm/main.py` | `POST /score-job` endpoint + `build_score_job_prompt()` |
| `apps/web/src/lib/scoring.api.ts` | Server functions: `scoreJob`, `scoreJobs` (batch) |
| `apps/web/src/components/DashboardJobSheet.tsx` | "Score Fit" button + score badge display |
| `apps/web/src/routes/dashboard.tsx` | "Fit" column in the jobs table |
| `packages/shared/src/types.ts` | `suitabilityScore` and `suitabilityReason` on `JobLead` |
| `packages/db/src/schema.ts` | Column definitions on `jobs` table |

## UI

### Dashboard Table
A "Fit" column shows the score as a colored badge:
- Green (7-10): Strong match
- Yellow (4-6): Moderate match
- Red (1-3): Poor match

### Job Detail Sheet
- "Score Fit" button in the details tab (requires scraped description)
- Score badge inline with ATS/difficulty tags
- Reason text shown next to the button
- "Re-score" button to update the score

## Integration with Preferences

The `minSuitabilityScore` in job preferences (default: 5) filters scored jobs from the auto-apply queue. Jobs that haven't been scored yet are not filtered by this check.
