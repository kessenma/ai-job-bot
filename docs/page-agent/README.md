# Page-Agent (Alibaba) — Evaluation for Job-App-Bot

## What Is Page-Agent?

[Page-Agent](https://github.com/alibaba/page-agent) (13.7k stars, MIT license) is a **client-side JavaScript GUI agent** from Alibaba. It runs **inside a browser tab** (in the DOM), not as a headless server-side tool. You give it natural language instructions like `"Click the login button"` or `"Fill in the email field with foo@bar.com"`, and it uses an LLM to interpret the page's DOM, plan actions, and execute them.

It is derived from the [browser-use](https://github.com/browser-use/browser-use) project but targets **in-page, client-side** use cases.

## How It Works

Each `execute()` call runs a **ReAct agent loop** (up to 40 steps by default):

1. **Observe** — Extract current DOM state (text-based representation, no screenshots needed)
2. **Think** — LLM reflects on progress, updates memory, plans next action
3. **Act** — Execute a tool (click, type, scroll, etc.)
4. **Loop** — Repeat until the LLM calls `done` or max steps reached

### Built-in Tools

| Tool | Description |
|------|-------------|
| `click_element_by_index` | Click an element by its DOM index |
| `input_text` | Type text into an input field |
| `select_dropdown_option` | Select a dropdown option by visible text |
| `scroll` / `scroll_horizontally` | Scroll the page or a specific element |
| `execute_javascript` | Run arbitrary JS (experimental, opt-in) |
| `wait` | Wait 1-10 seconds for loading |
| `ask_user` | Prompt the user for clarification |
| `done` | Signal task completion |

**Not yet implemented:** `upload_file`, `go_back`, `send_keys`, `extract_structured_data`

### Basic Usage

```javascript
import { PageAgent } from 'page-agent'

const agent = new PageAgent({
  model: 'gpt-4o',
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'sk-...',
  language: 'en-US',
})

const result = await agent.execute('Fill in the application form with my details')
// { success: boolean, data: string, history: HistoricalEvent[] }
```

### Configuration

- Works with any OpenAI-compatible LLM endpoint (OpenAI, Qwen, Ollama, etc.)
- Custom tools can extend or override built-ins
- Lifecycle hooks: `onBeforeStep`, `onAfterStep`, `onBeforeTask`, `onAfterTask`
- Page-specific instructions via `getPageInstructions(url)`
- Content transformation (e.g., mask sensitive data before sending to LLM)

## Comparison: Page-Agent vs Playwright

| Aspect | Playwright (current) | Page-Agent |
|--------|---------------------|------------|
| **Execution model** | Server-side, headless/headed via CDP | Client-side, runs as in-page JS |
| **Selector strategy** | CSS/XPath, explicit locators | LLM interprets DOM, natural language |
| **Setup** | Node.js + browser binary | npm package or CDN script tag |
| **Docker support** | Yes (our current setup) | No — requires a real browser tab |
| **Headless mode** | Yes | No |
| **Multi-domain** | Native | Requires Chrome extension |
| **Determinism** | Deterministic, programmatic | Probabilistic (LLM decides actions) |
| **File upload** | Yes | Not implemented yet |
| **Cost** | Free (no API calls) | LLM API cost per step |
| **Speed** | Fast (direct DOM manipulation) | Slow (LLM round-trip per action) |
| **Anti-detection** | Configurable (UA rotation, proxies) | N/A (runs as real user in browser) |

## Why It Doesn't Fit Our Architecture

Our Playwright service (`apps/playwright`) is a **headless Docker service** that:

- Launches Chromium programmatically in a container
- Navigates to job sites (LinkedIn, Workday, Recruitee, Join.com, etc.)
- Runs unattended with persistent LinkedIn sessions
- Streams screenshots via SSE to the web app
- Handles file uploads (resume PDFs)
- Uses rate limiting and proxy rotation for anti-detection
- Exposes an HTTP API (Hono server on port 8084)

**Page-Agent cannot do any of this.** It:

- Cannot launch a browser — it must be injected into an already-open page
- Cannot run headlessly or in Docker
- Cannot navigate across domains without a Chrome extension
- Has no file upload support (TODO in source)
- Adds LLM API cost and latency to every single click/type action
- Is non-deterministic — the same instruction may produce different actions

## Where Page-Agent Could Be Useful

Despite not being a Playwright replacement, there are potential complementary use cases:

1. **Browser extension for assisted applying** — A Chrome extension where the user browses job sites normally and Page-Agent helps fill forms interactively
2. **Handling unknown form layouts** — For ATS platforms we haven't written specific handlers for, an LLM-driven approach could be more flexible than CSS selectors
3. **User-facing copilot** — Embed into the web app to help users interact with job listings in an iframe

## Alternatives Worth Exploring

If the goal is to add LLM-driven intelligence to headless browser automation, these are more suitable:

| Tool | Description | Headless | Server-side |
|------|-------------|----------|-------------|
| [browser-use](https://github.com/browser-use/browser-use) | Python, LLM-driven browser automation via Playwright | Yes | Yes |
| [Stagehand](https://github.com/browserbase/stagehand) | TypeScript, AI web browsing framework built on Playwright | Yes | Yes |
| [LaVague](https://github.com/lavague-ai/LaVague) | Python, LLM-powered web agent using Selenium | Yes | Yes |

These maintain the headless/Docker model while adding LLM intelligence for dynamic form handling — a potentially better fit for extending our Playwright service.

## Verdict

**Page-Agent is not a viable replacement for our Playwright service.** It solves a different problem (in-page AI copilot) than what we need (headless server-side automation). The alternatives listed above are closer to what we'd want if we decide to add LLM-driven browser automation capabilities.
