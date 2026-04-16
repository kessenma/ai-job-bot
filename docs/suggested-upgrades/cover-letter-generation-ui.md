# Cover Letter Generation UI & Style Modes

**Source:** cover-letter-llm (ALMA AI), job-application-bot-by-ollama-ai (JobHuntr) | **Priority:** High | **Effort:** Medium

## What It Does

Adds an on-demand cover letter generator to the UI that takes a job description and produces a tailored cover letter using the existing LLM service and uploaded samples. Users can choose between style modes (Classic formal vs. Modern concise), review/edit before copying, and save generated letters as Google Docs in a dedicated Drive folder.

## Why It Matters

The current system uploads cover letter *samples* for style-matching and has a fully working `/generate-cover-letter` LLM endpoint — but there's no UI to actually generate a cover letter for a specific job. This is the missing link between "I uploaded my samples" and "I have a ready-to-use cover letter for this application."

## Current State

- [x] Cover letter sample upload + embedding (`CoverLetterManagement.tsx`, `resume.api.ts`)
- [x] LLM `/generate-cover-letter` endpoint with sample-aware prompting (`prompts.py`)
- [x] Resume text extraction + embedding pipeline
- [x] UI to trigger generation for a specific job
- [x] Style mode selection (Classic / Modern)
- [x] Generated letter storage in Google Drive

## Prerequisites

- **Google Docs + Drive integration** — OAuth scopes for `drive.file` and `documents`, plus the `docs.server.ts` module with helpers for creating/organizing Google Docs. Implement the Google Docs feature plan first, then this feature reuses those helpers for cover letter storage.

## Implementation Plan

### 1. Style Modes in LLM Prompt

Add a `style` field (`"classic" | "modern"`) to `CoverLetterRequest` in `apps/llm/schemas.py` and branch the system prompt in `prompts.py`:

- **Classic:** 3-4 formal paragraphs, "Dear Hiring Manager" salutation, business-formal tone, emphasizes overlapping skills and experience
- **Modern:** Single concise paragraph, "Hi, I'm [name]…" opener, conversational-professional tone, answers "tell me about yourself" format

Both styles should:
- Highlight overlapping technologies and keywords between resume and job description
- Use optimistic, affirmative language
- Include a call-to-action closing
- Mirror the candidate's voice from uploaded samples when available

### 2. Generated Cover Letters Table

New `generated_cover_letters` table in `packages/db/src/schema.ts`:
- `id` — auto-increment PK
- `jobUrl` — nullable FK to `jobs.url`
- `company` — text
- `role` — text
- `style` — text (`classic` | `modern`)
- `content` — generated letter text
- `modelUsed` — which LLM model produced it
- `generationTimeS` — real
- `driveDocId` — text, nullable (Google Docs ID once saved to Drive)
- `driveUrl` — text, nullable (full Google Docs URL)
- `createdAt` — text (ISO timestamp)

### 3. Google Drive Storage

Reuse the `docs.server.ts` helpers from the Google Docs feature:

New function `createCoverLetterDoc(title, content)` in `docs.server.ts`:
- Create a Google Doc with the cover letter text and light formatting (date, salutation bold, paragraphs)
- Organize into a "Job App Bot - Cover Letters" Drive folder (separate from resumes)
- Returns `{ docId, docUrl }`

Generated cover letters are stored locally in SQLite (quick access/history) and optionally saved as editable Google Docs in Drive (for tweaking before submission).

### 4. Web API Layer

New `apps/web/src/lib/cover-letter-gen.api.ts`:
- `generateCoverLetter({ jobUrl?, company, role, jobDescription, style })` — calls the LLM service, stores result in DB, returns the generated letter
- `saveCoverLetterToDrive({ id })` — creates the Google Doc, updates the DB row with `driveDocId` and `driveUrl`
- `getGeneratedLetters({ jobUrl? })` — fetches history
- `deleteGeneratedLetter({ id })` — removes from DB

The `generateCoverLetter` function should automatically:
1. Fetch the user's resume text from uploads
2. Fetch embedded cover letter sample texts
3. Build the request to the LLM service

### 5. Cover Letter Generator Component

New `apps/web/src/components/settings/CoverLetterGenerator.tsx` below `CoverLetterManagement` on settings:

- **Input section:**
  - Text area for job description (paste or type)
  - Company name + role title fields
  - Style toggle: Classic / Modern (segmented control)
- **Generate button** — calls API, shows loading spinner with generation time
- **Result section:**
  - Rendered letter in a styled card
  - "Copy to Clipboard" button
  - "Save to Google Drive" button — creates Doc, shows link
  - "Regenerate" button for same inputs
- **History:** Collapsible list of previously generated letters with company, role, style, date, and optional Drive link

### 6. Job Sheet Integration

Add a "Generate Cover Letter" button to `DashboardJobSheet.tsx` detail view:
- Pre-fills company, role, and job description from the selected job
- Opens the generator as a modal or slide-over panel
- Saves the generated letter linked to the job URL

## Key Files Modified

- `apps/llm/schemas.py` — added `style` field to `CoverLetterRequest` (`"classic" | "modern"`, defaults to `"classic"`)
- `apps/llm/prompts.py` — branched `build_cover_letter_prompt` by style (classic: 3-4 formal paragraphs; modern: single concise paragraph)
- `packages/db/src/schema.ts` — added `generatedCoverLetters` table
- `packages/db/src/migrate.ts` — added `generated_cover_letters` CREATE TABLE migration
- `apps/web/src/lib/docs.server.ts` — added `createCoverLetterDoc()` with "Job App Bot - Cover Letters" Drive folder
- `apps/web/src/lib/llm.api.ts` — added `style` param to `generateCoverLetter`, returns `modelUsed`
- `apps/web/src/lib/cover-letter-gen.api.ts` — new API layer: `generateAndSaveCoverLetter`, `saveCoverLetterToDrive`, `getGeneratedLetters`, `deleteGeneratedLetter`
- `apps/web/src/components/settings/CoverLetterGenerator.tsx` — new standalone generator with style toggle, copy, Drive save, and history
- `apps/web/src/routes/settings.tsx` — mounted `CoverLetterGenerator` below `CoverLetterManagement`, loads history via `getGeneratedLetters`
- `apps/web/src/components/DashboardJobSheet.tsx` — replaced basic "Generate with AI" with style toggle + `generateAndSaveCoverLetter` + copy/save-to-Drive actions
