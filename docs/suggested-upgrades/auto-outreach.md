# Auto-Outreach to Hiring Managers

**Source:** JobHuntr | **Priority:** Low | **Effort:** Medium

## What It Does

After applying to a job, automatically sends a LinkedIn connection request to the hiring manager or recruiter with a personalized message.

## Risk

High risk of LinkedIn account restrictions if done aggressively. LinkedIn actively monitors automated connection requests. Must be carefully rate-limited.

## Existing Foundation

The `jobs` table already tracks `recruiter_linkedin` URLs, so the data is available. The Playwright service has LinkedIn automation capabilities (login, session persistence, human-like delays).

## Implementation Plan

### Outreach Queue
After a successful application, add the recruiter to an outreach queue:
- `outreach_queue` table: job_id, recruiter_linkedin_url, message_template, status, sent_at
- Status: pending → sent → accepted → ignored

### Message Generation
Use the LLM to generate a personalized connection message:
- Reference the specific role applied for
- Keep it short (LinkedIn has a 300-char limit for connection notes)
- Mention a relevant skill or mutual interest

### Rate Limiting
- Maximum 5 connection requests per day
- Random delays between requests (30-120 minutes apart)
- Skip if the recruiter is already a connection

### Key Files
- `apps/playwright/src/linkedin.ts` — add connection request endpoint
- `packages/db/src/schema.ts` — `outreach_queue` table
- `apps/web/src/routes/auto-apply.tsx` — outreach queue UI in follow-up tab
