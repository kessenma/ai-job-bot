# Dry Run Applying — Status & Context

## Goal

Build a "Dry Run" flow in the Job URL section of the Auto Apply page where:

1. User enters a job URL and clicks **Dry Run**
2. Playwright bot navigates to the page, fills the form with the user's profile data (but does NOT submit)
3. A **full-page screenshot** of the pre-filled form is shown in a scrollable panel so the user can review what was filled
4. **Skipped fields** (ones the bot couldn't fill) are shown with interactive inputs:
   - Dropdowns should show as `<select>` with the actual options scraped from the page
   - Text fields show as text inputs
5. An **AI Suggest** button sends the skipped fields + user's profile + experience to the LLM to auto-fill suggestions
6. User can **Approve & Queue** (sends to the Review tab for batch submission) or **Reject**
7. All of this happens inside a unified **BotViewerPanel** with live SSE streaming (logs, progress, screenshots)

## Architecture

### Components involved

- **`apps/web/src/components/auto-apply/JobUrlActions.tsx`** — The main UI component with URL input, Screenshot/Fill Form/Dry Run buttons, and the BotViewerPanel with dry run review
- **`apps/web/src/components/ui/BotViewerPanel.tsx`** — Collapsible panel showing live SSE stream (logs, progress, screenshots) with `children` slot for review UI
- **`apps/web/src/hooks/useBotStream.ts`** — React hook connecting to SSE endpoint for real-time bot visibility
- **`apps/web/src/lib/queue.api.ts`** — `queueDryRun()` server function that calls `fillForm()` and saves results to `applicationQueue` table
- **`apps/web/src/lib/playwright.api.ts`** — `fillForm()` and `screenshotUrl()` server functions that call the Playwright service
- **`apps/web/src/lib/llm.api.ts`** — `answerFormFields()` server function for AI suggestions

### Playwright service

- **`apps/playwright/src/apply/router.ts`** — `/fill-form` endpoint with SSE event bus support (`sessionId` param)
- **`apps/playwright/src/shared/form-filler/`** — Core form scanning + filling logic (modularized):
  - `index.ts` — orchestrator `fillForm()` + barrel re-exports
  - `types.ts` — `FormProfile`, `FilledField`, `SkippedField`, `ScannedField`
  - `constants.ts` — `LABEL_TO_FIELD`, `DROPDOWN_SYNONYMS`, `cssEscape`
  - `scan-fields.ts` — `scanFormFields()` page.evaluate scan (passes 1–5)
  - `discover-options.ts` — `discoverDropdownOptions()` click-to-open custom dropdowns
  - `select-utils.ts` — `selectBestOption()` synonym-aware dropdown matching
  - `fill-fields.ts` — `fillMatchedFields()`, `fillFileUploads()`, `fillConsentCheckboxes()`
- **`apps/playwright/src/scrape/router.ts`** — `/screenshot` endpoint with SSE event bus support

### LLM service

- **`apps/llm/main.py`** — `POST /answer-form-fields` endpoint
- **`apps/llm/prompts.py`** — `build_answer_form_fields_messages()` prompt builder
- **`apps/llm/schemas.py`** — `AnswerFormFieldsRequest`, `AnswerFormFieldsResponse`, `FormFieldInput`, `FormFieldAnswer`

### SSE streaming flow

1. Frontend generates a `sessionId` (UUID) and passes it to the server function
2. Server function passes `sessionId` to the Playwright endpoint
3. Playwright endpoint emits events to `eventBus` (log, progress, screenshot, done, error)
4. Frontend connects to `/api/pw-stream/stream/:sessionId` via `EventSource` (proxied through Vite to the Playwright service)
5. `useBotStream` hook receives events and updates state
6. `BotViewerPanel` renders the live stream

### Data flow for dry run

```
User clicks "Dry Run"
  → JobUrlActions generates sessionId, calls queueDryRun()
    → queueDryRun() calls fillForm() with sessionId
      → fillForm() sends POST to Playwright /fill-form with sessionId
        → Playwright navigates, fills form, emits SSE events
        → Takes full-page screenshot (fullPage: true)
        → Returns { filled, skipped, screenshot, ... }
      → fillForm() saves screenshot to DB, returns FillFormResult
    → queueDryRun() saves to applicationQueue table, returns QueueItem
  → JobUrlActions sets dryRunResult state
  → BotViewerPanel shows review UI (filled fields, skipped fields with inputs, screenshot, approve/reject)
```

## What Works

- [x] URL input with Screenshot, Fill Form, and Dry Run buttons
- [x] SSE streaming for Screenshot and Fill Form (live logs, progress, screenshots in BotViewerPanel)
- [x] `sessionId` threaded through to Playwright `/fill-form` and `/screenshot` endpoints
- [x] Event bus emissions in both endpoints (log, progress, screenshot, done, error)
- [x] Full-page screenshot (`fullPage: true`) in the `/fill-form` endpoint
- [x] Dry run calls `queueDryRun()` which fills form and saves to queue
- [x] Filled fields displayed with type badges (TEXT/SELECT)
- [x] Skipped fields displayed with editable inputs
- [x] AI Suggest button calls `POST /answer-form-fields` on the LLM service
- [x] AI suggestions auto-populate skipped field inputs with confidence badges
- [x] Approve & Queue / Reject buttons with `markReviewed()` integration
- [x] User edits on skipped fields passed as `edits` when approving
- [x] CSS.escape polyfill for Node.js (was crashing with `CSS is not defined`)
- [x] Proxy fix (placeholder `PROXY_LIST` in `.env` was causing connection failures)
- [x] Deduplication of scanned fields by label
- [x] Greenhouse React Select dropdown detection (Pass 4b in form-filler.ts)
- [x] Click-to-discover with scoped option scraping (per-container, not global)
- [x] Normalized label matching in click-to-discover (strips `*`, normalizes whitespace)
- [x] `fillForm()` accepts `log` callback — SSE log events stream to BotViewerPanel
- [x] BotViewerPanel stays visible on errors / connection loss (doesn't disappear)
- [x] `useBotStream` marks stream as done with "Connection lost" on unexpected close

## Current Issues (for next chat)

### 1. Greenhouse React Select — MOSTLY FIXED

**Original problem:** Greenhouse does NOT use native `<select>` elements. They use React Select custom components. Options only render after clicking the trigger.

**What was done:**

1. **Pass 4b** added to `page.evaluate()` — detects React Select by `[class*="select__control"]` CSS selector. Upgrades any existing text entry to `select` type so click-to-discover processes it.

2. **Click-to-discover scoped scraping** — After clicking a trigger, option scraping walks up from the trigger to its React Select container and searches within that scope. Falls back to last-in-DOM-order menu for portaled menus.

3. **Dedup fix** — Pass 5 now deduplicates by label only (not `label::type`), preferring `select` over `text`, and merging `id`/`name` across entries.

4. **Phone country code exclusion** — Pass 4b checks whether the `select__control` actually contains the same `<input>` as the existing text entry (by id/name match). If the text entry has a real id/name but the React Select's inner input is different, the text field is kept as-is (e.g. phone number input is not replaced by the country code picker sharing the same wrapper label).

**Remaining:** Need to verify all dropdowns get correct options matched to the right questions. The scoped scraping (container-first, then last-portal-in-DOM) should prevent cross-contamination, but field-specific testing on live Greenhouse forms is needed.

### 2. LinkedIn Profile field being skipped despite being in the profile

**Minor:** The `linkedinUrl` field in the apply profile isn't matching the "LinkedIn Profile*" label. The `LABEL_TO_FIELD` regex is `/\b(linkedin)\b/i` which should match "LinkedIn Profile" — may be a data issue (profile `linkedinUrl` is empty/null).

## Key Files to Read

| File | Purpose |
|------|---------|
| `apps/web/src/components/auto-apply/JobUrlActions.tsx` | Main UI — dry run button, bot viewer, review UI |
| `apps/web/src/components/ui/BotViewerPanel.tsx` | Collapsible live stream panel with children slot |
| `apps/web/src/hooks/useBotStream.ts` | SSE hook for real-time bot visibility |
| `apps/playwright/src/shared/form-filler/` | Form scanning, click-to-discover, field filling (modularized — see index.ts for orchestrator) |
| `apps/playwright/src/apply/router.ts` | /fill-form endpoint with SSE events |
| `apps/playwright/src/shared/event-bus.ts` | In-memory pub/sub for SSE |
| `apps/web/src/lib/queue.api.ts` | queueDryRun() server function |
| `apps/web/src/lib/playwright.api.ts` | fillForm() / screenshotUrl() server functions |
| `apps/web/src/lib/llm.api.ts` | answerFormFields() server function |
| `apps/llm/main.py` | /answer-form-fields endpoint |
| `apps/llm/prompts.py` | build_answer_form_fields_messages() |

## Test URL

```
https://job-boards.greenhouse.io/ketryx/jobs/4408592008?gh_src=24f616dd8us&source=LinkedIn
```

This Greenhouse form has:
- Standard text fields (name, email, phone, location, salary) — these get filled correctly
- **Custom dropdown**: "How many years of work experience..." with options like "1-2 years", "3-5 years", etc.
- **Custom dropdown**: "Are you an EU citizen or possess a RWR Card Plus?" with options "Yes" / "No"
- **Custom dropdown**: "Where did you learn of the position?" with 11 options (Recruiter Outreach, LinkedIn, etc.)
- Text field: "LinkedIn Profile"
- Text field: "GitHub or Website URL"
