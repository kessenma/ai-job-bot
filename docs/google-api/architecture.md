# Google API Architecture

The app uses four Google APIs through a single OAuth 2.0 flow: Gmail, Sheets, Drive, and Docs. All share the same token and authenticated client.

## OAuth Flow

```
User clicks "Connect Gmail" in Settings
  └─ getAuthUrl() generates consent URL with all scopes
      └─ Google shows consent screen
          └─ Redirects to /auth/callback with authorization code
              └─ handleAuthCallback(code) exchanges for tokens
                  └─ Tokens saved to data/uploads/.gmail-token.json
```

**Token storage:** File-based, not in the database. Stored at `${DATA_DIR}/uploads/.gmail-token.json`.

**Token refresh:** Automatic via `googleapis` library. When tokens refresh, the `on('tokens', ...)` listener writes the updated tokens back to the file.

**Re-authentication:** Required when new OAuth scopes are added. The `prompt: 'consent'` flag forces the full consent screen, which issues a new refresh token covering all requested scopes.

## Scopes

All scopes are requested together in a single consent flow.

| Scope | API | Purpose |
|-------|-----|---------|
| `gmail.readonly` | Gmail | Scan emails for recruiter responses |
| `gmail.send` | Gmail | Send follow-up emails |
| `spreadsheets` | Sheets | Read recruiter sheet, write job search results |
| `drive.readonly` | Drive | Import Google Docs as resume (export as text + PDF) |
| `drive.file` | Drive | Create app-managed files (generated resumes in Drive) |
| `documents` | Docs | Create and format Google Docs with headings, bold, etc. |

**GCP Console:** Google Drive, Docs, Gmail, and Sheets APIs must be enabled in the project.

## Module Layout

```
apps/web/src/lib/
├── gmail.server.ts     # OAuth client, token management, email scanning
├── gmail.api.ts        # Server functions: connect, disconnect, scan, send
├── sheets.server.ts    # Sheet config, job import/export, header mapping
├── sheets.api.ts       # Server functions: configure, import, sync
├── docs.server.ts      # Google Docs import, Drive file creation, PDF export
├── resume.api.ts       # Server functions: upload, import from Docs, remove
├── experience.server.ts # Experience profile CRUD (SQLite)
├── experience.api.ts   # Server functions: list, save, remove entries
└── llm.api.ts          # generateResume() calls LLM service
```

## Shared Auth Client

All Google API modules reuse the same OAuth2 client from `gmail.server.ts`:

```typescript
// gmail.server.ts — the single source of truth for Google auth
export function getAuthenticatedClient() {
  const tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'))
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials(tokens)
  oauth2Client.on('tokens', (newTokens) => {
    // Auto-persist refreshed tokens
    writeFileSync(TOKEN_PATH, JSON.stringify({ ...tokens, ...newTokens }, null, 2))
  })
  return oauth2Client
}

// Other modules import and use it:
import { getAuthenticatedClient } from './gmail.server.ts'
const auth = getAuthenticatedClient()
const drive = google.drive({ version: 'v3', auth })
const docs = google.docs({ version: 'v1', auth })
const sheets = google.sheets({ version: 'v4', auth })
```

## API Usage by Feature

### Gmail — Email Scanning & Sending

**Module:** `gmail.server.ts`

- `scanEmailsForCompany(company)` — searches Gmail for emails mentioning a company, classifies as rejection/interview/applied/other
- `sendEmail(to, subject, body)` — sends via authenticated Gmail account
- `findWorkdayVerificationEmail()` — extracts verification links from Workday emails (last 15 minutes)

### Google Sheets — Job Data Mirror

**Module:** `sheets.server.ts`

- `loadJobsFromSheet()` — reads recruiter's tab, auto-detects headers (scans first 30 rows), maps 40+ column name variations to internal fields
- `appendToJobSearchTab(jobs)` — writes found jobs to "Job Search" tab (fire-and-forget mirror)
- `importJobsFromSheet()` — imports recruiter jobs into SQLite with deduplication

**Sheet config:** Stored at `data/uploads/.sheet-config.json` (or `GOOGLE_SHEET_ID` env var).

**1-minute cache:** Sheet data is cached to reduce API calls during rapid dashboard refreshes.

### Google Drive — Resume Import & Storage

**Module:** `docs.server.ts`

Import flow (reading existing docs):
```
User pastes Google Docs URL
  └─ extractDocId(url) parses /document/d/{id}/
      └─ drive.files.get({ fileId }) → document title
      └─ drive.files.export({ mimeType: 'text/plain' }) → raw text
      └─ drive.files.export({ mimeType: 'application/pdf' }) → PDF buffer
          └─ Saved via existing saveFile() → disk + SQLite + embeddings
```

Creation flow (generating new docs):
```
LLM generates resume text
  └─ createResumeDoc(title, content)
      └─ docs.documents.create({ title }) → empty Google Doc
      └─ docs.documents.batchUpdate() → insert text + apply heading styles
      └─ findOrCreateFolder("Job App Bot - Resumes") → folder ID
      └─ drive.files.update({ addParents: folderId }) → organize in folder
```

Export flow:
```
exportDocAsPdf(docId)
  └─ drive.files.export({ mimeType: 'application/pdf' })
      └─ Returns base64 PDF string
```

### Google Docs API — Formatted Resume Creation

**Module:** `docs.server.ts`

Used specifically for creating professionally formatted documents (not just plain text):

- `documents.create()` — creates a new empty Google Doc
- `documents.batchUpdate()` — applies structured formatting:
  - `insertText` — adds content at specific positions
  - `updateParagraphStyle` — sets heading levels (H1, H2)
  - `updateTextStyle` — applies bold/italic to key terms

The Docs API uses 1-based character indexing. Each formatting request specifies a `range` with `startIndex` and `endIndex` to target specific text.

## File Storage Layout

```
data/uploads/
├── .gmail-token.json       # Google OAuth tokens (auto-refreshed)
├── .sheet-config.json      # Configured sheet URL & ID
├── .session-token           # App password session (separate from Google)
├── resume/
│   └── resume.pdf           # Current resume (replaced on each upload/import)
└── cover-letter/
    └── *.pdf                # Multiple cover letters with timestamps
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `experienceEntries` | Detailed work history for resume generation |
| `generatedResumes` | Tracks resumes created in Google Drive (docId, URL, text) |
| `uploads` | Resume/cover letter file metadata + extracted text |
| `documentEmbeddings` | 384-dim vectors for semantic matching |
| `scannedEmails` | Gmail scan results with classification |
| `syncLog` | Audit trail for sheet/gmail imports |

## Resume Generation Pipeline

The full flow from experience profile to Google Docs resume:

```
Experience Profile (SQLite)
  └─ User triggers "Generate Resume" for a specific job
      └─ Web app calls generateResume() server function
          └─ Sends experience entries + job description to LLM service
              └─ POST /generate-resume (FastAPI)
                  └─ build_resume_prompt() → ATS-optimized prompt
                  └─ llama-cpp inference → tailored resume text
      └─ createResumeDoc(title, resumeText)
          └─ Google Docs API creates formatted document
          └─ Organized in "Job App Bot - Resumes" Drive folder
      └─ Record saved to generatedResumes table
          └─ Links resume to job (jobId, company, role, driveUrl)
```

## Error Handling

| Scenario | Error | User Message |
|----------|-------|-------------|
| No Google account connected | Token file missing | "Google account not connected. Please connect in Settings." |
| Doc not accessible | Drive API 403/404 | "Cannot access this document. Make sure it's in your Google Drive or shared with you." |
| Invalid Google Docs URL | Regex match fails | "Invalid Google Docs URL. Expected: docs.google.com/document/d/..." |
| Missing Drive scope | API 403 insufficient permissions | "Please reconnect your Google account to enable Docs access." |
| Sheet not configured | Config file missing | "Google Sheets not configured." |

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | *(required)* | OAuth 2.0 client ID from GCP Console |
| `GOOGLE_CLIENT_SECRET` | *(required)* | OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/auth/callback` | OAuth callback URL |
| `GOOGLE_SHEET_ID` | *(none)* | Alternative to `.sheet-config.json` |
| `DATA_DIR` | `./data` | Base directory for token/config files |
