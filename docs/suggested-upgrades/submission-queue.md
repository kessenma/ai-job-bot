# Submission Queue with Review Before Submit

**Source:** JobHuntr | **Priority:** Medium | **Effort:** Medium-High

## What It Does

Instead of immediately submitting applications, the system fills forms and takes screenshots, placing them in a review queue. The user approves or edits before final submission. Jobs are sorted by suitability score.

## Why It Matters

Auto-apply without review is risky — wrong fields, bad cover letter, consent issues. A review queue makes the automation trustworthy enough to use at scale. LinkedIn Easy Apply already has `dryRun` mode — this extends it into a proper queue.

## Implementation Plan

### Database
New `application_queue` table:
- `job_id` — FK to jobs
- `status` — `pending` | `approved` | `rejected` | `submitted` | `failed`
- `filled_fields` — JSON of what was filled
- `skipped_fields` — JSON of what was skipped
- `screenshot` — base64 or FK to screenshots
- `cover_letter_id` — FK to jobCoverLetters
- `suitability_score` — cached from jobs table
- `created_at`

### Backend
- After `fillForm()` or `linkedInEasyApply({ dryRun: true })`, save the result to the queue instead of being ephemeral
- New server functions: `getApplicationQueue()`, `approveApplication()`, `rejectApplication()`
- `approveApplication()` calls the existing `/apply` endpoint

### UI
- New "Review Queue" tab on `/auto-apply` page
- Queue items show: company, role, filled fields count, skipped fields, screenshot thumbnail, score
- "Approve & Submit" and "Reject" action buttons per item
- Sort by suitability score (highest first)

### Key Files to Modify
- `packages/db/src/schema.ts` — new table
- `packages/db/src/migrate.ts` — migration
- `apps/web/src/lib/playwright.api.ts` — save to queue after fill
- `apps/web/src/routes/auto-apply.tsx` — new tab
- New: `apps/web/src/components/auto-apply/ReviewQueue.tsx`
