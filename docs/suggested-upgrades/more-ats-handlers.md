# More ATS Apply Handlers

**Source:** Both example repos | **Priority:** Medium | **Effort:** Medium per handler

## What It Does

Extends auto-apply support beyond the existing handlers (LinkedIn Easy Apply, Workday, Recruitee, Join) to cover more ATS platforms.

## Current State

The ATS classifier in `packages/shared/src/ats-classifier.ts` already detects these platforms. Handlers exist for:
- [x] LinkedIn Easy Apply (`linkedin-easy-apply.ts`)
- [x] Workday (`handlers/workday.ts`)
- [x] Recruitee (`handlers/recruitee.ts`)
- [x] Join (`handlers/join.ts`)

## Handlers to Add (Priority Order)

### 1. Lever (Easy)
- Standard multi-section form
- URL pattern: `jobs.lever.co/company/...`
- Fields: name, email, phone, LinkedIn, resume upload, cover letter
- Usually a single-page form

### 2. Greenhouse (Medium, Very Common)
- URL pattern: `boards.greenhouse.io/company/...`
- Multi-section form with custom questions
- Resume + cover letter upload
- Sometimes has EEOC/diversity questions

### 3. Ashby (Medium, Growing)
- URL pattern: `jobs.ashbyhq.com/company/...`
- Modern React-based form
- Standard fields + custom questions

### 4. Personio (Medium, Common in DACH)
- URL pattern: `company.jobs.personio.de/...`
- German-language forms common
- Standard application fields

## Implementation Pattern

Follow the existing handler pattern in `apps/playwright/src/handlers/`:

```typescript
// handlers/lever.ts
import type { ATSHandler } from './base.ts'

export const leverHandler: ATSHandler = {
  canHandle(url: string) {
    return url.includes('jobs.lever.co')
  },
  async apply(page, url, profile) {
    // Navigate, fill fields, upload resume, submit
  },
}
```

Register in `apps/playwright/src/handlers/index.ts`.

## Key Files
- `apps/playwright/src/handlers/` — new handler files
- `apps/playwright/src/handlers/index.ts` — handler registry
- `apps/playwright/src/form-filler.ts` — generic form filling (shared logic)
- `packages/shared/src/ats-classifier.ts` — platform detection (already done)
