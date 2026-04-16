# LLM-Driven Browser Automation Alternatives

Evaluation of three headless-capable, server-side AI browser automation tools as potential upgrades or complements to our current Playwright service.

**Current setup:** TypeScript/Bun Playwright service in Docker (`apps/playwright`) with hand-coded handlers for LinkedIn, Workday, Recruitee, Join.com. Uses CSS selectors, custom form-filling logic, anti-detection (UA rotation, proxies), persistent LinkedIn sessions, and SSE streaming.

---

## Quick Comparison

| | browser-use | Stagehand | LaVague |
|---|---|---|---|
| **Language** | Python only | TypeScript (native) | Python only |
| **Stars** | 84k | 22k | 6k |
| **Last commit** | Today (very active) | Today (very active) | Jan 2025 (dormant) |
| **License** | MIT | MIT | Apache 2.0 |
| **Browser engine** | CDP (own `cdp-use` lib) | CDP (own understudy layer) | Selenium (primary), Playwright (incomplete) |
| **Playwright relationship** | Replaced Playwright with raw CDP | Uses CDP directly, Playwright optional dep | Uses Selenium, Playwright "coming soon" |
| **Headless/Docker** | Yes, official Dockerfile | Yes, no official Dockerfile | Yes (Selenium only), no Dockerfile |
| **Anti-detection** | Moderate (paid cloud has full stealth) | Via Patchright + Browserbase cloud | None |
| **LLM providers** | 15+ (OpenAI, Anthropic, Ollama, etc.) | 15+ (same breadth, via Vercel AI SDK) | 7+ (via LlamaIndex) |
| **Local models** | Yes (Ollama, vLLM) | Yes (Ollama) | Poor (docs say open-source models struggle) |
| **File uploads** | Yes | Yes | Partial (broken on some sites) |
| **Structured extraction** | Yes (Pydantic schemas) | Yes (Zod schemas) | No dedicated API |
| **Persistent sessions** | Yes (Chrome profiles, cookies) | Yes (userDataDir, cookies) | Yes (Chrome profiles) |
| **Caching** | No built-in | Yes (action + agent caching) | No |
| **Cost per step** | ~$0.01-0.05 (varies by model) | ~$0.01-0.05 (varies by model) | ~$0.05 (GPT-4o) |
| **Bun compatible** | N/A (Python) | Untested but likely | N/A (Python) |

---

## 1. browser-use

**What it is:** Python library (84k stars) that gives LLMs full browser control via CDP. The most popular tool in this space.

### Pros

- **Massive community** — 84k stars, daily commits, active Discord, 9.7k forks
- **Battle-tested for job applications** — their repo literally includes a job application example
- **Rich action space** — file upload, dropdowns, multi-tab, PDF save, send keys, structured extraction
- **Sensitive data handling** — credentials never sent to LLM (injected at execution time)
- **Official Docker support** with pre-built Dockerfile
- **Hosted model** (`ChatBrowserUse`) optimized for browser tasks at low cost ($0.20/1M input tokens)
- **Parallel agents** — can run multiple agents sharing a browser session
- **Video recording** built-in for debugging
- **Domain restrictions** — `allowed_domains` / `prohibited_domains` for safety
- **MCP server** built into the library

### Cons

- **Python only** — would require a separate Python service alongside your TypeScript stack, or a full rewrite
- **Replaces Playwright entirely** — no interop with existing Playwright code; raw CDP underneath
- **Non-deterministic** — same task can fail on retry; your hand-coded handlers are more reliable when they work
- **Token-expensive** — sends screenshots + DOM state on every step
- **No CAPTCHA solving** in open-source version (need paid cloud)
- **No built-in UA rotation** in open-source — you'd need to handle this yourself
- **Pre-1.0 API** — breaking changes between minor versions
- **No SSE streaming** of intermediate steps (async results only; would need custom event bus integration)
- **Heavy resource usage** — Chrome + LLM calls per action

### Fit for our project

browser-use is the most capable option but requires Python. It would mean either:
- (A) Rewriting `apps/playwright` in Python, or
- (B) Running browser-use as a separate Python sidecar service that handles LLM-driven tasks while Playwright handles deterministic ones

Best suited as a **fallback for unknown ATS platforms** where we don't have hand-coded handlers.

---

## 2. Stagehand

**What it is:** TypeScript-native AI browser automation framework (22k stars) by Browserbase. Combines natural language instructions with programmatic control.

### Pros

- **TypeScript native** — fits directly into your Bun/TypeScript stack, no language bridge needed
- **Three useful primitives**: `act()` (do something), `extract()` (get structured data with Zod), `observe()` (plan actions without executing)
- **Zod schema extraction** — `extract("get all job listings", z.object({...}))` maps perfectly to your scraping needs
- **Action caching** — observe once, replay without LLM calls on repeat visits (huge cost saver)
- **Self-healing selectors** — cached selectors auto-fallback to LLM when page structure changes
- **Agent mode** — `agent()` for multi-step autonomous workflows with configurable step limits
- **CUA (Computer Use Agent)** mode — uses Claude's computer-use for complex visual tasks
- **Patchright** (stealth Playwright fork) included as optional dep
- **Browserbase cloud** available for managed stealth, CAPTCHA solving, session recording (optional, not required)
- **Full cookie API** — matches Playwright's cookie interface via CDP
- **File uploads** supported via locator API
- **Built-in token tracking** — per-method cost monitoring
- **Local mode** — runs with your own Chrome, no cloud dependency

### Cons

- **Bun compatibility untested** — `engines` field specifies Node `^20.19.0 || >=22.12.0` only; your project uses Bun
- **`act()` must be atomic** — "click the submit button" works, "fill the form and submit" does not. Multi-step needs `agent()`
- **No official Docker image** — you'd build your own (straightforward since it's just Chrome + Node)
- **182 open issues** — active development but also active bugs
- **Younger ecosystem** than browser-use — fewer examples, smaller community
- **Chromium only** — no Firefox/Safari
- **LLM costs still apply** per action (mitigated by caching)
- **Agent mode reliability** varies by page complexity

### Fit for our project

Stagehand is the **best language fit** since it's TypeScript. Integration strategy:
- Keep existing deterministic handlers (LinkedIn Easy Apply, Workday, etc.) as-is
- Use Stagehand's `extract()` with Zod for job description scraping (replace CSS selector approach)
- Use Stagehand's `agent()` as a fallback for unknown ATS platforms
- Action caching means repeat visits to the same site structure don't cost LLM tokens
- Could live alongside Playwright in the same service or gradually replace it

The Bun compatibility question needs testing before committing.

---

## 3. LaVague

**What it is:** Python LAM (Large Action Model) framework (6k stars) for AI web agents. Uses a World Model + Action Engine architecture.

### Pros

- **Clean architecture** — World Model (vision) → Action Engine (code gen) → Driver (execution) is elegant
- **Open source, Apache 2.0** — permissive license
- **Gradio demo UI** built-in for testing
- **Chrome profile persistence** for sessions
- **Mix-and-match models** — different LLMs for World Model vs Action Engine (e.g., Claude for vision, Gemini for code gen)

### Cons

- **Project appears abandoned** — no commits since Jan 2025, community asking if it's maintained ([issue #639](https://github.com/lavague-ai/LaVague/issues/639))
- **No GitHub releases ever published** — never reached a stable release
- **No anti-detection whatsoever** — LinkedIn, Workday, etc. would block it immediately
- **No structured data extraction API** — it's an action agent, not a scraper
- **File uploads broken** on many sites (open issue #406)
- **Playwright support incomplete** — headless and multi-tab still "coming soon" (and won't ship given dormancy)
- **Expensive** — ~$0.05/step with GPT-4o, $0.50+ per multi-step task
- **Telemetry on by default** — sends objectives, URLs, and actions to LaVague servers
- **5 retries per step by default** — can cause surprise cost spikes
- **Python only, no JS/TS bindings**
- **Open-source multimodal models don't work well** (per their own docs)

### Fit for our project

**Not recommended.** The project is effectively dead, has no anti-detection, no structured extraction, broken file uploads, and incomplete Playwright support. Every other option is better.

---

## Recommendation

### Tier 1: Stagehand (best fit)
- TypeScript native = no language bridge, integrates into your existing `apps/playwright` service
- `extract()` with Zod is a direct upgrade for job description scraping
- Action caching saves money on repeat site patterns
- Can coexist with your existing Playwright handlers — use Stagehand for new/unknown ATS, keep deterministic handlers for LinkedIn/Workday
- Test Bun compatibility first

### Tier 2: browser-use (most capable, wrong language)
- More mature, larger community, richer feature set
- But requires Python — either a sidecar service or full rewrite
- Consider if you're ever willing to add Python to the stack
- Their hosted model (`ChatBrowserUse`) is the cheapest option for LLM costs

### Tier 3: LaVague (avoid)
- Dead project, no anti-detection, broken features. Skip it.

---

## Hybrid Architecture (Recommended Approach)

Rather than replacing Playwright entirely, the strongest strategy is **deterministic-first, LLM-fallback**:

```
Incoming job application request
    │
    ├─ Known ATS? (LinkedIn, Workday, Recruitee, Join.com)
    │   └─ Yes → Use existing Playwright handlers (fast, free, reliable)
    │
    └─ Unknown ATS?
        └─ Use Stagehand agent() to navigate and fill forms
            └─ Cache successful action patterns for next time
```

This preserves the reliability and speed of your current handlers while adding AI flexibility for the long tail of job sites you haven't built handlers for.

### What this would look like in practice

```typescript
// In apps/playwright/src/apply/router.ts
import { Stagehand } from '@browserbasehq/stagehand';

// Existing handler check
const handler = findHandler(url);

if (handler) {
  // Deterministic path (existing code)
  return handler.apply(page, profileData);
} else {
  // LLM fallback for unknown ATS
  const stagehand = new Stagehand({ env: "LOCAL", model: "anthropic/claude-sonnet-4-20250514" });
  await stagehand.init();
  const result = await stagehand.agent({
    instruction: `Apply for this job with the following details: ${JSON.stringify(profileData)}`,
    maxSteps: 20,
  }).execute();
  return result;
}
```
