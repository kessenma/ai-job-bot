# LLM Cost / Token Tracking

**Source:** AIHawk | **Priority:** Low | **Effort:** Low

## What It Does

Logs token usage and estimated cost per LLM API call. Useful for monitoring spend when using cloud LLM providers.

## Current State

The local LLM service already returns token counts in its responses:
```json
{
  "usage": {
    "input_tokens": 90,
    "output_tokens": 216,
    "total_tokens": 306
  }
}
```

## Why Low Priority

With local LLM inference via llama-cpp, there are no API costs. This only becomes relevant once the multi-LLM provider feature is implemented and users switch to cloud APIs (OpenAI, Claude, etc.).

## Implementation Plan

### Database
New `llm_usage_log` table:
- `endpoint` — which LLM endpoint was called (score-job, generate-cover-letter, chat, etc.)
- `provider` — local, openai, anthropic, google
- `model` — model name/id
- `input_tokens`, `output_tokens`, `total_tokens`
- `estimated_cost` — calculated from per-token pricing
- `generation_time_s`
- `created_at`

### Pricing Config
Store per-provider token pricing (updates as providers change prices):
- OpenAI GPT-4o: $2.50/1M input, $10/1M output
- Claude Sonnet: $3/1M input, $15/1M output
- Local: $0

### UI
Add a "Usage" section to the LLM Management component on Settings:
- Total tokens used this month
- Estimated cost this month
- Per-endpoint breakdown
- Usage chart over time

### Key Files
- `packages/db/src/schema.ts` — `llm_usage_log` table
- `apps/llm/main.py` — log usage after each API call
- `apps/web/src/components/settings/LlmManagement.tsx` — usage display
