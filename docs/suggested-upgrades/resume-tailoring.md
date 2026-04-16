# AI Resume Tailoring

**Source:** AIHawk | **Priority:** Medium | **Effort:** High

## What It Does

For each job, the LLM rewrites resume bullet points to emphasize skills and keywords from the job description, optimizing for ATS keyword matching. Generates a tailored PDF.

## Why It Matters

Tailored resumes get significantly higher response rates. ATS systems score resumes by keyword overlap with the job description.

## Implementation Plan

### LLM Endpoint
New `POST /tailor-resume` in `apps/llm/main.py`:
- Input: resume text + job description
- Output: rewritten resume sections with job-specific keywords emphasized
- Prompt: instruct LLM to keep factual accuracy while optimizing for keyword match

### Storage
New `tailored_resumes` table:
- `job_url` — unique, FK reference
- `tailored_text` — the rewritten resume content
- `original_resume_name` — which base resume was used
- `created_at`

### PDF Generation
Use Playwright's `page.pdf()` to convert HTML to PDF:
1. Create an HTML template with resume styling
2. Insert the tailored text
3. Render in Playwright and export as PDF
4. Store the PDF in the uploads directory

This avoids adding new dependencies since the Playwright service is already available.

### UI
- "Tailor Resume" button in the DashboardJobSheet details tab
- Shows a preview of the tailored text
- "Download PDF" button to get the generated document

### Key Files to Modify
- `apps/llm/main.py` — new `/tailor-resume` endpoint
- `packages/db/src/schema.ts` — new `tailored_resumes` table
- `apps/web/src/lib/scoring.api.ts` or new `tailoring.api.ts`
- `apps/web/src/components/DashboardJobSheet.tsx` — UI button + preview
- `apps/playwright/src/server.ts` — HTML-to-PDF endpoint
