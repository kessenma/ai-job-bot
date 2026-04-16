# Multi-LLM Provider Support

**Source:** AIHawk | **Priority:** Low | **Effort:** Medium

## What It Does

Adds cloud LLM options (OpenAI, Claude, Gemini) alongside the local llama-cpp models for higher quality scoring and generation.

## Why It Matters

Local 1B-7B models produce adequate but not great output. Cloud LLMs (GPT-4o, Claude Sonnet) produce significantly better cover letters, more accurate scoring, and more nuanced resume tailoring. Worth adding when local model quality becomes a bottleneck.

## Implementation Plan

### Settings UI
Add API key configuration in Settings:
- OpenAI API key
- Anthropic API key
- Google AI API key
- Provider selector (local / openai / anthropic / google)

Store keys in a `llm_config` table (encrypted at rest).

### LLM Service Changes
In `apps/llm/main.py`, add provider routing:
- If a cloud API key is configured for the selected provider, proxy requests to that API
- Fall back to local llama-cpp if no key is set
- Use the same request/response models — only the backend changes

### Cost Tracking
When cloud providers are used, log token usage and estimated cost per call. The LLM service already returns `usage` with token counts.

### Key Files
- `apps/llm/main.py` — provider routing logic
- `packages/db/src/schema.ts` — `llm_config` table
- `apps/web/src/routes/settings.tsx` — API key management UI
- `apps/web/src/components/settings/LlmManagement.tsx` — provider selector
