# Apply Error Log

Tracks errors from auto-apply and form-fill operations, with screenshots for debugging.

## How It Works

1. When Easy Apply or Fill Form fails, the error is captured along with a screenshot of the page state
2. Errors are stored in the `apply_errors` table with a reference to the screenshot
3. The **Settings** page shows an "Apply Error Log" section with all active errors
4. Errors can be filtered by handler and error type, expanded for details, and dismissed

## Error Types

| Type | Description | Badge Color |
|------|-------------|-------------|
| `no_easy_apply` | Job doesn't have an Easy Apply button | Gray |
| `captcha` | CAPTCHA detected during apply | Yellow |
| `login_expired` | LinkedIn session expired mid-apply | Blue |
| `form_stuck` | No Next/Review/Submit button found | Red |
| `timeout` | Operation timed out | Orange |
| `unknown` | Other errors | Gray |

## Database Table: `apply_errors`

| Column | Description |
|--------|-------------|
| `job_url` | The job that was being applied to |
| `job_id` | FK to jobs table (if available) |
| `handler` | `linkedin-easy-apply`, `fill-form`, `apply` |
| `error_type` | One of the types above |
| `error_message` | Full error text |
| `screenshot_id` | FK to screenshots table |
| `steps_completed` | How far Easy Apply got before failing |
| `dismissed` | Whether the user has dismissed this error |

## Key Files

- `apps/web/src/lib/error-log.api.ts` - Server functions (get, log, dismiss, clear)
- `apps/web/src/components/settings/ApplyErrorLog.tsx` - UI component
- `apps/web/src/routes/settings.tsx` - Wired into settings page
- `packages/db/src/schema.ts` - Table definition (`applyErrors`)

## UI Features

- **Error table** with timestamp, job URL, handler badge, error type badge
- **Expandable rows** showing full error message and steps completed
- **Screenshot viewer** — click the image icon to view the failure screenshot inline
- **Filter dropdowns** by handler and error type
- **Dismiss** individual errors or clear all at once

## API Functions

- `getApplyErrors({ handler?, errorType?, dismissed? })` - Filtered query with screenshot data
- `logApplyError({ jobUrl, handler, errorType, errorMessage, screenshotId?, stepsCompleted? })` - Called automatically on failure
- `dismissError({ id })` - Dismiss a single error
- `dismissAllErrors()` - Dismiss all active errors
- `clearDismissedErrors()` - Permanently delete dismissed errors
