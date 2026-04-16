# Lightpanda Browser Evaluation

Can Lightpanda replace Chromium in the Playwright automation service?

**Date:** 2026-03-24
**Status:** Research / Not yet viable for full replacement

---

## 1. What is Lightpanda

Lightpanda is a headless browser written from scratch in **Zig** — not based on Chromium, Blink, or WebKit. It uses V8 for JavaScript execution and libcurl for HTTP, but has no graphical rendering pipeline.

**Performance claims** (benchmarked on AWS EC2 m5.large, 933 real web pages):
- **9x less memory** than Chrome
- **11x faster** execution than Chrome
- Instant startup (no Chromium cold boot)

**Key capabilities:**
- Chrome DevTools Protocol (CDP) server on port 9222
- Compatible with Playwright and Puppeteer via CDP WebSocket
- HTML5 parsing, DOM tree, JavaScript (V8), DOM APIs
- AJAX (XHR + Fetch), cookies, custom headers, proxy support, network interception
- Docker image: `lightpanda/browser:nightly`

**Current status:** Beta — subset of Web APIs implemented, may encounter crashes. Lightpanda's own README warns that Playwright scripts may break as new Web APIs are added.

**Why consider it:** The current Playwright Dockerfile requires 10+ system libraries (libnss3, libatk, libdrm, libgbm, etc.) plus `bunx playwright install chromium` (~400MB). Chromium is the heaviest and most fragile dependency in the container.

---

## 2. Feature Compatibility Matrix

### Likely Compatible

These features are explicitly listed as supported by Lightpanda or are basic CDP operations.

| Feature | Where Used | Notes |
|---------|-----------|-------|
| `page.goto()` + waitUntil | Everywhere | CDP navigation — should work |
| `page.evaluate()` / JS execution | cookie-consent, form-filler, click-overlay, humanize | V8 engine — core strength |
| `page.$()` / `page.$$()` CSS selectors | All handlers, scrape router | DOM + querySelector |
| `element.click()` | All handlers | Listed as supported |
| `element.fill()` / `element.type()` | form-filler, linkedin-easy-apply, workday | "Input form" listed |
| Cookies / session state | linkedin-auth, browser contexts | Supported |
| Custom HTTP headers | browser.ts context options | Supported |
| Proxy support | browser.ts proxy rotation | Supported |
| `page.url()`, `page.title()` | page-status, scrape router | Basic CDP |
| `page.textContent()` | page-status, scrape router | DOM API |
| `page.content()` | linkedin-auth | DOM serialization |

### Uncertain / Risky

Not explicitly confirmed by Lightpanda. May work partially or require workarounds.

| Feature | Where Used | Risk Level | Issue |
|---------|-----------|-----------|-------|
| `page.waitForSelector()` | workday-utils, cookie-consent, linkedin-easy-apply | Medium | Needs CDP DOM observation |
| `page.waitForLoadState()` | humanize (`domcontentloaded`, `load`) | Medium | `domcontentloaded` likely works; `load` may not fire correctly |
| `page.locator()` / Locator API | workday-utils, humanize, form-filler | Medium | Depends on Playwright's internal strategy for connected browsers |
| `page.getByRole()` | cookie-consent (buttons, links) | High | Requires accessibility tree APIs |
| `page.selectOption()` | form-filler, linkedin-easy-apply | Medium | Requires CDP Input domain |
| `element.isChecked()` / `.check()` | form-filler (consent checkboxes) | Medium | DOM property check may work |
| `element.inputValue()` | linkedin-easy-apply | Low-Medium | DOM property access |
| `page.keyboard.type()` / `.press()` | workday-utils, linkedin-auth | Medium | Requires CDP Input.dispatchKeyEvent |
| Shadow DOM via `element.shadowRoot` | cookie-consent (Strategy 1) via evaluate | Medium | Works if V8 DOM bindings expose shadowRoot |
| `page.frames()` / iframe navigation | cookie-consent (Strategy 4) | High | iframe support unclear |

### Definite Blockers

These features are fundamentally incompatible with Lightpanda's architecture.

| Feature | Where Used | Why It Breaks |
|---------|-----------|--------------|
| `chromium.launchPersistentContext()` | browser.ts — LinkedIn session | Lightpanda connects via CDP WebSocket, not Playwright's launch API. No on-disk session persistence. |
| `chromium.launch()` | browser.ts — generic browser | Must use `connectOverCDP()` instead — different lifecycle model |
| `page.screenshot()` (PNG/JPEG) | scrape/router, click-overlay, workday, BotViewerPanel recordings | **No visual rendering engine.** No pixel buffer, no compositing. Returns nothing useful. |
| `element.isVisible()` | All handlers extensively | Requires computed styles + layout engine. Lightpanda has neither. |
| `element.boundingBox()` | humanize.ts (`humanClick`) | Requires layout geometry computation |
| `page.mouse.move()` / `.click()` | humanize.ts (coordinate-based) | Needs bounding boxes which need layout |
| `window.getComputedStyle()` | cookie-consent (button scoring, visibility) | Requires CSS/layout engine |
| `getBoundingClientRect()` | cookie-consent, humanize | Requires layout computation |

---

## 3. Critical Blockers — Detail

### Blocker 1: No Persistent Browser Context

`browser.ts` uses `chromium.launchPersistentContext(LINKEDIN_DATA_DIR, {...})` to store cookies, localStorage, and session data to disk at `data/linkedin-profile`. This keeps the LinkedIn session alive across container restarts.

Lightpanda provides a CDP WebSocket endpoint. Playwright connects via `chromium.connectOverCDP("ws://...")` which gives a `Browser` object but **not** a persistent context. There is no file-backed session storage.

**Impact:** Every container restart loses the LinkedIn login. Re-authentication triggers LinkedIn's 2FA/verification flow, which will likely flag the account.

**Workaround:** Manually export/import cookies via `Network.getCookies` / `Network.setCookies` and localStorage via `page.evaluate()`, persisted to a JSON file. This is fragile and doesn't cover IndexedDB, service workers, or other state LinkedIn may rely on.

### Blocker 2: No Screenshots

Screenshots are used in three places:
1. `/screenshot` endpoint in `scrape/router.ts`
2. BotViewerPanel recording system — captures JPEG frames during LinkedIn search (~40-80 frames per search)
3. Workday handler for debugging failed applications

Lightpanda has **no rendering/paint pipeline** — no layout engine, no pixel buffer. `page.screenshot()` will fail or return blank.

**Impact:** BotViewerPanel becomes non-functional. Screenshot-based debugging breaks entirely.

### Blocker 3: No Layout Engine

Used pervasively across the codebase:
- `element.isVisible()` — every handler uses this to find interactive elements
- `humanClick()` in humanize.ts — gets `boundingBox()` for coordinate-based mouse movement (anti-detection)
- Cookie consent — `getComputedStyle()` for button scoring, `getBoundingClientRect()` for visibility checks
- Form detection — visibility checks to identify active form fields

Without CSS computation and layout, these all return null/incorrect values. The anti-detection humanization and cookie consent dismissal both break.

---

## 4. Integration Approach (If Proceeding)

### Connection Model Change

```typescript
// BEFORE (current — browser.ts):
browser = await chromium.launch({ headless: true, proxy: ... })
linkedInCtx = await chromium.launchPersistentContext(DATA_DIR, { ... })

// AFTER (Lightpanda):
browser = await chromium.connectOverCDP('ws://lightpanda:9222')
// No persistent context available — manual cookie management needed
```

### Manual Cookie Persistence

```typescript
// After LinkedIn login:
const cookies = await context.cookies();
await fs.writeFile('data/linkedin-cookies.json', JSON.stringify(cookies));

// On reconnect:
const cookies = JSON.parse(await fs.readFile('data/linkedin-cookies.json'));
await context.addCookies(cookies);
// Note: localStorage, IndexedDB, service workers are NOT preserved
```

### Visibility Check Workarounds

Replace `isVisible()` with heuristic DOM checks via `page.evaluate()`:

```typescript
const visible = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  return el.offsetWidth > 0 && el.offsetHeight > 0 && !el.closest('[hidden]');
}, selector);
```

Less reliable than Playwright's built-in checks, but may work for most cases.

### Mouse/Coordinate Workarounds

Replace `humanClick()` coordinate-based clicks with simple `element.click()`. Accept reduced anti-detection effectiveness.

---

## 5. Docker Implications

| Metric | Current (Chromium) | Lightpanda |
|--------|-------------------|------------|
| Base image | `oven/bun:1.3.4` (~150MB) | Same |
| System deps | libnss3, libatk, libdrm, libgbm, etc. (~100MB) | None needed |
| Browser binary | `bunx playwright install chromium` (~400MB) | Lightpanda binary (~30MB) |
| **Total estimate** | **~650-700MB** | **~200-250MB** |
| Build time bottleneck | Chromium download (60-120s) | Eliminated |
| Architecture | Single container (Bun + embedded Chromium) | Two containers (Lightpanda CDP server + Bun app) or single with binary |

---

## 6. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Lightpanda crashes on complex SPAs (LinkedIn, Workday) | Critical | High (beta) | Fallback to Chromium |
| Missing Web APIs break Playwright's internal strategy | Critical | High (acknowledged in README) | Pin version, extensive testing |
| LinkedIn detects non-Chromium fingerprint | High | Medium | Investigate CDP response differences |
| Cookie persistence issues cause repeated 2FA | High | Very High | Manual cookie management (fragile) |
| Future Lightpanda updates change behavior | Medium | High | Version pinning, regression tests |
| No visual debugging capability | Medium | Certain | Keep Chromium for debugging |
| Limited community/support (beta OSS project) | Medium | High | Accept risk or contribute upstream |

---

## 7. Recommendation

### Now: Do Not Replace Chromium

The three blockers (persistent context, screenshots, layout-dependent APIs) each individually prevent a full replacement. Combined with beta status and Playwright's own compatibility disclaimer, this is too risky for the production automation service.

### Medium-Term: Hybrid Pilot for Scraping

Lightpanda could handle **read-only scraping** where screenshots aren't needed and `isVisible()` usage is minimal:

- Route `/scrape-description` and `/probe` through Lightpanda
- Keep LinkedIn search, form filling, and apply flows on Chromium
- Run Lightpanda as a sidecar container alongside the existing Chromium container

This captures resource savings for the highest-volume, simplest endpoints.

### Long-Term: Re-evaluate at 1.0

Watch for these additions before reconsidering full replacement:
- Layout engine / CSS computed styles (fixes `isVisible()`, `boundingBox()`)
- Screenshot support (even basic DOM-to-image)
- Persistent context / session storage support
- iframe maturity
- Stable Playwright compatibility guarantee

### Suggested Next Step

Create a proof-of-concept branch that connects to Lightpanda for the `/scrape-description` endpoint only. Test against 50 real job URLs and measure:
- Success rate vs Chromium
- Memory usage difference
- Speed improvement
- Failure modes encountered
