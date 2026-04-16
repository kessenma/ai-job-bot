# Form Question Tracking

Tracks which form questions were successfully answered vs. which had no matching answer, across all apply operations. Helps you improve auto-fill coverage over time.

## How It Works

1. After each Easy Apply or Fill Form operation, answered and unanswered questions are saved to the `form_questions` table
2. Questions are deduplicated by a normalized hash — the same question appearing across different jobs increments the occurrence counter
3. Unanswered questions appear on the **Auto Apply** page in the "Unanswered Questions" panel
4. You can provide answers directly in the UI, which are saved for future runs

## Database Table: `form_questions`

| Column | Description |
|--------|-------------|
| `question_text` | The original label text |
| `question_hash` | Normalized hash for deduplication |
| `field_type` | `text`, `select`, `radio`, `checkbox` |
| `options` | JSON array of available options (for select/radio) |
| `status` | `answered`, `unanswered`, `user_answered` |
| `answered_value` | What was filled in |
| `profile_field` | Which profile field matched |
| `platform` | `linkedin`, `recruitee`, etc. |
| `occurrences` | How many times this question has been seen |

Unique index on `(question_hash, platform)` ensures deduplication per platform.

## Key Files

- `apps/web/src/lib/questions.api.ts` - Server functions (save, get, answer)
- `apps/web/src/components/auto-apply/UnansweredQuestions.tsx` - UI panel
- `packages/db/src/schema.ts` - Table definition (`formQuestions`)

## API Functions

- `saveFormQuestions({ questions, platform, jobUrl?, jobId? })` - Upsert questions after each apply
- `getUnansweredQuestions()` - Get all unanswered, ordered by frequency
- `answerQuestion({ id, answer, profileField? })` - User provides an answer

## UI

The "Unanswered Questions" panel on the Auto Apply page shows:

- Question text and type
- Platform and occurrence count
- Available options (for select/radio fields)
- Inline "Answer" form to provide values
