# Continuous Background Automation

**Source:** JobHuntr | **Priority:** Low | **Effort:** Medium (once prerequisites exist)

## What It Does

Runs job hunting on a schedule: periodically searches for new jobs, scores them, generates cover letters, and queues applications for review.

## Prerequisites

Requires these features to be implemented first:
- [x] Duplicate detection
- [x] Job preferences / blacklist filtering
- [x] LLM suitability scoring
- [x] AI cover letter generation
- [ ] Submission queue with review

## Implementation Plan

### Scheduler
Add a cron-like scheduler using `node-cron` or Bun's built-in timer in the server:

```
Every 6 hours:
  1. LinkedIn search (using saved search keywords)
  2. Scrape descriptions for new jobs
  3. Score all unscored jobs
  4. Generate cover letters for jobs scoring >= threshold
  5. Queue high-scoring jobs for review (dry run mode)
```

### Configuration
Add schedule settings to job preferences:
- Search frequency (hourly, every 6h, daily)
- Auto-score new jobs (boolean)
- Auto-generate cover letters (boolean)
- Auto-queue for review (boolean)

### Notifications
- Show a summary of what the background run did on the dashboard
- Badge on the Pipeline dock icon for new jobs found

### Key Files
- `apps/server/src/scheduler.ts` — new cron scheduler
- `apps/web/src/lib/preferences.api.ts` — schedule configuration
- `apps/web/src/routes/dashboard.tsx` — background run summary
