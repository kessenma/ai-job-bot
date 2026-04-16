# LinkedIn Easy Apply Automation

Automates LinkedIn's "Easy Apply" multi-step form flow directly from the Auto Apply page.

## How It Works

1. User clicks **Easy Apply** on a LinkedIn job in the Auto Apply queue
2. The Playwright server logs into LinkedIn (reusing the persistent session)
3. Navigates to the job URL, clicks the Easy Apply button
4. Loops through up to 10 form steps, filling:
   - Phone number and email
   - Text/number inputs (matched by label to your apply profile)
   - Radio buttons (Yes/No questions)
   - Dropdowns (with synonym matching for multi-language support)
   - File uploads (resume)
5. Clicks Next/Review/Submit as appropriate
6. Returns results including filled fields, unanswered questions, and a screenshot

## Key Files

- `apps/playwright/src/linkedin-easy-apply.ts` - Core form automation logic
- `apps/playwright/src/linkedin.ts` - Route handler (`POST /linkedin-easy-apply`)
- `apps/web/src/lib/playwright.api.ts` - Web API layer (`linkedInEasyApply`)
- `apps/web/src/components/auto-apply/AutoApplyRow.tsx` - UI button

## API

### `POST /linkedin-easy-apply`

**Request:**
```json
{
  "jobUrl": "https://www.linkedin.com/jobs/view/12345",
  "profile": {
    "firstName": "...",
    "lastName": "...",
    "email": "...",
    "phone": "...",
    "resumePath": "/path/to/resume.pdf"
  },
  "dryRun": false
}
```

**Response:**
```json
{
  "status": "applied",
  "stepsCompleted": 3,
  "answeredQuestions": [{"label": "Phone", "value": "+1234567890", "type": "text"}],
  "unansweredQuestions": [{"label": "Years of experience with Python", "type": "text", "required": true}],
  "screenshot": "<base64>"
}
```

Status values: `applied`, `review_needed` (dry run), `failed`, `no_easy_apply`, `error`

## Question-to-Answer Mapping

The system matches form labels to profile fields using regex patterns. LinkedIn-specific patterns include:

| Question Pattern | Profile Field |
|-----------------|---------------|
| "years of experience" | `yearsOfExperience` |
| "work authorization" | `workVisaStatus` |
| "visa sponsorship" | `requireSponsorship` |
| "salary expectation" | `salaryExpectations` |
| "start date" | `earliestStartDate` |
| "willing to relocate" | `willingToRelocate` |

These extend the base `LABEL_TO_FIELD` patterns from `form-filler.ts` (name, email, phone, location, etc.).

## Dry Run Mode

Pass `dryRun: true` to fill all form fields but stop before clicking Submit. Useful for testing and verifying that fields are being filled correctly.
