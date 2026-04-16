# Workday Auto-Apply Handler

## Overview

The Workday handler adds automated form-filling support for job applications hosted on Workday (`myworkdayjobs.com`). It integrates into the existing Playwright service handler pattern alongside the Recruitee and Join handlers.

Workday is classified as "hard" difficulty in the ATS classifier because it uses custom web components with `data-automation-id` attributes rather than standard HTML form elements, requiring a dedicated handler instead of generic DOM scanning.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Web App (:3000)                                         │
│                                                          │
│  auto-apply page                                         │
│    └─ fillForm() ──► classifyATS(url)                    │
│         │                │                               │
│         │  workday?      │  other?                       │
│         ▼                ▼                               │
│    POST /apply      POST /fill-form                      │
│    (handler-based)  (generic DOM scan)                   │
└────────┬─────────────────┬───────────────────────────────┘
         │                 │
         ▼                 ▼
┌──────────────────────────────────────────────────────────┐
│  Playwright Service (:8084)                              │
│                                                          │
│  /apply endpoint                                         │
│    └─ getHandler(url) ──► workdayHandler.apply()         │
│         │                                                │
│         ├─ startApplication (adventure button flow)      │
│         ├─ Page 1: fillContactInfo (name, address, phone)│
│         ├─ Page 2: fillExperience (resume, links, work)  │
│         ├─ Pages 3-4: click through (voluntary discl.)   │
│         └─ return ApplyResult + screenshot               │
└──────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `apps/playwright/src/handlers/workday.ts` | Main handler: `canHandle()` + `apply()` with multi-page form flow |
| `apps/playwright/src/handlers/workday-utils.ts` | Workday-specific helpers: selector checks, dropdown filling, date fields |
| `apps/playwright/src/handlers/base.ts` | Extended `ApplyProfile` and `ApplyResult` interfaces |
| `apps/playwright/src/handlers/index.ts` | Handler registry (workday registered here) |
| `apps/web/src/lib/playwright.api.ts` | Web-side orchestration: routing, auth flow, Gmail polling |
| `apps/web/src/lib/gmail.server.ts` | Gmail integration: `findWorkdayVerificationEmail()` for auth flow |
| `apps/web/src/lib/gmail.api.ts` | `findWorkdayVerification` server function |
| `apps/playwright/src/server.ts` | Playwright endpoints: `/workday/create-account`, `/workday/verify-and-signin` |

## How It Works

### URL Detection

The handler matches any URL containing `myworkdayjobs.com`:

```
https://company.wd5.myworkdayjobs.com/en-US/External/job/...
```

### Form Flow

Workday applications follow a multi-page wizard:

1. **Start Application** - Click the "Apply" adventure button, then "Apply Manually"
2. **Page 1: Contact Info** - First/last name, street address, city, state/region, postal code, phone
3. **Page 2: Experience** - Resume upload, LinkedIn/GitHub links, work experience entries, education, skills
4. **Page 3: Voluntary Disclosures** - Gender, ethnicity, veteran status (currently skipped)
5. **Page 4: Self-Identification** - Disability status (currently skipped)

The handler currently fills Pages 1-2 and clicks through Pages 3-4 without filling them.

### Workday Selector Patterns

Workday uses `data-automation-id` attributes on all form elements, which are consistent across different employer Workday instances:

```
input[data-automation-id="legalNameSection_firstName"]
input[data-automation-id="addressSection_addressLine1"]
button[data-automation-id="phone-device-type"]
input[data-automation-id="file-upload-input-ref"]
button[data-automation-id="bottom-navigation-next-button"]
```

### Dropdown Handling

Workday dropdowns are not standard `<select>` elements. They require:
1. Click the dropdown button
2. Type the value with a delay (character by character)
3. Press Enter to confirm

This is handled by `selectWorkdayDropdown()` in `workday-utils.ts`.

### Error Handling

On any failure during the form flow:
- A screenshot of the current page state is captured
- The error context (which step failed) is recorded
- Lists of successfully filled and skipped fields are returned
- The `ApplyResult` status is set to `'error'` with details

### Dry Run Mode

The handler does **not** submit the application. It fills out the form and returns `status: 'applied'` with a screenshot of the final state. This allows review before actual submission is implemented.

## Extended Profile Fields

The `ApplyProfile` interface was extended with optional fields for Workday (backwards-compatible with existing handlers):

```typescript
// Contact details
firstName?: string
lastName?: string
street?: string
city?: string
state?: string
zipCode?: string
country?: string

// Links
githubUrl?: string

// Structured data for Page 2
workExperiences?: WorkExperienceEntry[]
education?: EducationEntry[]
skills?: string[]
```

Work experience entries support: job title, company, location, start/end dates (month + year), description.

Education entries support: school, degree, field of study, GPA, start/end year.

## Routing Logic

When `fillForm()` is called from the web frontend, it checks the ATS platform:

- **Workday URLs** → routed to `POST /apply` via `fillFormViaHandler()`, which builds the extended `ApplyProfile` and calls the handler-based endpoint
- **All other URLs** → routed to `POST /fill-form` for generic DOM-based form filling

The handler result is mapped back to `FillFormResult` format so the UI displays it consistently.

## Authentication

Workday requires a **separate account per employer** — there is no shared identity across companies. Account creation requires **email verification** (clicking a link sent to your email).

### Auth Flow Architecture

The auth flow is orchestrated by the **web server** (which has Gmail access) coordinating with the **Playwright service** (which has the browser):

```
Web Server (orchestrator)              Playwright Service (browser)
─────────────────────────              ────────────────────────────
1. fillFormViaHandler()
   └─ POST /apply ──────────────────► workdayHandler.apply()
                                         └─ detects sign-in needed
   ◄─── { status: 'needs_manual' } ──     └─ returns needs_manual

2. workdayAuthFlow()
   └─ POST /workday/create-account ──► Opens job URL
                                         ├─ Clicks Apply
                                         ├─ Tries sign-in (existing acct?)
                                         │   └─ Error → account doesn't exist
                                         ├─ Clicks "Create Account"
                                         ├─ Fills email + generated password
                                         └─ Submits
   ◄─── { status: 'verification_needed' }

3. Poll Gmail (up to 90 seconds)
   └─ findWorkdayVerificationEmail()
      └─ Gmail API: search for
         "from:workday.com subject:verify"
      └─ Extract verification link from
         email HTML body
   ──► Found link!

4. POST /workday/verify-and-signin ──► Opens verification link
                                         ├─ Navigates back to job URL
                                         ├─ Clicks Apply
                                         ├─ Signs in with credentials
                                         └─ Lands in application form
   ◄─── { status: 'ready' }

5. POST /apply (retry) ─────────────► workdayHandler.apply()
                                         └─ Now authenticated, fills form
   ◄─── { status: 'applied' }
```

### Key Details

- **Password generation**: A random password meeting Workday requirements (uppercase, lowercase, numbers, special chars) is generated per employer. No credentials are stored long-term.
- **Gmail polling**: After account creation, the web server polls Gmail every 15 seconds for up to 90 seconds looking for the verification email.
- **Verification link extraction**: The `findWorkdayVerificationEmail()` function reads full email bodies (HTML) and uses regex patterns to find Workday verification/confirmation URLs.
- **Fallback**: If Gmail isn't connected or the verification email isn't found, the handler returns `needs_manual` so the user can complete auth manually.

### Gmail Integration

The verification email scanner (`gmail.server.ts`) searches for:
- Emails from `workday.com` or `myworkdayjobs.com`
- With subjects containing "verify", "verification", "confirm", or "activate"
- Received within the last 15 minutes

It extracts the verification link from the email HTML by matching URLs containing `myworkdayjobs.com` or `workday.com` with verification-related path segments.

### Playwright Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /workday/create-account` | Navigate to job URL, attempt sign-in, create account if needed |
| `POST /workday/verify-and-signin` | Visit verification link, navigate back to job, sign in |

## Planned Enhancements

1. **Enhanced resume parsing** - Extract work experience, education, and skills from uploaded resumes to auto-populate the extended profile fields
2. **Error tracking** - Dedicated `applyErrors` DB table and Settings page section for viewing failure screenshots and error details
3. **Voluntary disclosures** (Pages 3-4) - Fill gender, ethnicity, veteran status, and disability fields from profile data
4. **Credential storage** - Optionally persist Workday credentials per employer domain for reuse

## Reference

The handler was ported from [Workday-Application-Automator](../apps/example-code/Workday-Application-Automator/), a Puppeteer-based script. The Puppeteer API maps nearly 1:1 to Playwright, with the main difference being file uploads (`uploadFile()` → `setInputFiles()`).
