# Cover Letter System

## Overview

The cover letter system has two main capabilities:

1. **Sample Management** — Upload previous cover letters as style references for AI generation
2. **AI Generation** — Generate tailored cover letters using your samples, resume, and experience profile

## Architecture

```
User Input (Settings Page)
    │
    ├─ CoverLetterManagement ── upload/manage sample cover letters
    │                           mark one as "root template" (primary)
    │
    └─ CoverLetterGenerator ─── company, role, job description, style
                                    │
                                    ▼
                          generateAndSaveCoverLetter()
                                    │
                                    ▼
                          generateCoverLetter() [llm.api.ts]
                            ├─ readCoverLetterTexts() → samples (primary first)
                            ├─ readResumeText() → resume
                            ├─ listExperienceEntries() → experience profile
                            └─ POST /generate-cover-letter → LLM backend
                                    │
                                    ▼
                          build_cover_letter_prompt() [prompts.py]
                            ├─ System: style instructions + root template + samples + resume
                            └─ User: experience entries + job description + company/role
                                    │
                                    ▼
                          Save to generatedCoverLetters table
                            ├─ Copy to clipboard
                            ├─ Save to Google Drive
                            └─ View in history
```

## Root Template

One uploaded cover letter can be designated as the **root template** (marked with a star icon). This tells the AI to prioritize its tone, structure, and writing style above other samples when generating new cover letters.

- The root template's extracted text is always sent as the first sample to the LLM
- The prompt explicitly instructs the model to prioritize the root template's style
- Up to 3 samples total are sent (root first, then others)
- Stored as `is_primary = true` on the `uploads` table row

## Experience Profile Integration

The cover letter generator now pulls from the Experience Profile section (experience_entries table) to give the LLM concrete work history to draw from. This means:

- The LLM can reference specific roles, companies, skills, and achievements
- Experience entries are included in the user message portion of the prompt
- Up to 5 entries are sent, each with role, company, dates, skills, and description (truncated at 500 chars)
- This works alongside the resume text — experience entries provide structured data while the resume provides formatting context

## Data Sources Used During Generation

| Source | Where it comes from | How it's used |
|---|---|---|
| Cover letter samples | `uploads` table (category=cover-letter) | Style/tone reference in system prompt |
| Root template | Sample with `is_primary=true` | Prioritized style reference |
| Resume text | `uploads` table (category=resume) | Background context in system prompt |
| Experience entries | `experience_entries` table | Structured work history in user prompt |
| Job description | User input | Matching keywords/skills in user prompt |

## Styles

- **Classic** — 3-4 formal paragraphs, "Dear Hiring Manager" salutation, business tone
- **Modern** — Single concise paragraph, "Hi, I'm [name]..." opener, conversational-professional

## Storage

Generated cover letters are stored in `generated_cover_letters` table with:
- Company, role, style, full text content
- Model used and generation time
- Optional Google Drive doc ID and URL (if saved to Drive)
- Optional job URL link

## Google Drive Integration

Generated letters can be saved as Google Docs via the "Save to Drive" button:
- Creates a formatted Google Doc titled "Cover Letter - {company} - {role}"
- Stored in a "Job App Bot - Cover Letters" folder
- Doc URL is saved back to the database for quick access

## Key Files

- `apps/web/src/components/settings/CoverLetterManagement.tsx` — Sample upload UI + root selector
- `apps/web/src/components/settings/CoverLetterGenerator.tsx` — Generation UI + history
- `apps/web/src/lib/cover-letter-gen.api.ts` — Server functions for generate/save/delete
- `apps/web/src/lib/llm.api.ts` — `generateCoverLetter()` that calls the LLM backend
- `apps/web/src/lib/uploads.server.ts` — `readCoverLetterTexts()` with primary-first ordering
- `apps/web/src/lib/resume.api.ts` — `setPrimaryCoverLetter()` + upload/delete
- `apps/llm/prompts.py` — `build_cover_letter_prompt()` with experience + root template support
- `apps/llm/schemas.py` — `CoverLetterRequest` Pydantic model
- `packages/db/src/schema.ts` — `uploads.isPrimary` + `generatedCoverLetters` table
