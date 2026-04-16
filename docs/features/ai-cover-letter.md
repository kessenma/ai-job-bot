# AI-Tailored Cover Letter Generation

Generates cover letters customized to each job using the local LLM, the candidate's resume, existing cover letter samples, and the scraped job description.

## How It Works

1. User opens a job in the dashboard detail sheet and goes to the "Cover Letter" tab
2. Clicks "Generate with AI"
3. The server sends the job description, company, role, location, resume text, and cover letter samples to `POST /generate-cover-letter`
4. The LLM generates a tailored cover letter
5. The generated text is shown in a preview panel
6. User can copy the text, create a document, and upload it to attach to the job

## Prompt Improvements

The cover letter prompt was enhanced (in `build_cover_letter_prompt()`) to:

- **ATS-optimize**: Include relevant keywords from the job description naturally
- **Company-specific**: Reference the company by name and mention role specifics
- **Results-oriented**: Keep the letter concise (3-4 paragraphs)
- **Keyword matching**: When a job description is provided, the prompt instructs the LLM to highlight matching skills from the resume and use job description keywords

## Key Files

| File | Purpose |
|------|---------|
| `apps/llm/main.py` | `build_cover_letter_prompt()` — improved prompt with ATS optimization |
| `apps/web/src/lib/llm.api.ts` | `generateCoverLetter` server function |
| `apps/web/src/components/DashboardJobSheet.tsx` | "Generate with AI" button + preview panel in cover letter tab |

## UI

### Cover Letter Tab (Job Detail Sheet)

- **"Generate with AI" button** — teal button at the top of the tab
- **Preview panel** — shows the generated text in a scrollable area with a lagoon-colored border
- **Instructions** — tells the user to copy and upload as a document
- **Upload** — existing upload button below for attaching the final cover letter
- **Attach existing** — list of previously uploaded cover letters

## Data Flow

```
DashboardJobSheet "Generate with AI" click
  └─ generateCoverLetter({ company, role, jobDescription, location, candidateName })
      └─ Server: readCoverLetterTexts() + readResumeText()
      └─ POST /generate-cover-letter to LLM service
      └─ Returns { coverLetter, generationTime }
  └─ Display generated text in preview panel
```

The candidate name and resume text are loaded server-side from the database, so the client only needs to pass job-specific data.
