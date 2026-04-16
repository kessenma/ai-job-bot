# Anti-Bot Strategy: Humanization + Proxy Rotation

Combines two complementary approaches to avoid detection during automated job searching and applying.

## Layer 1: Human-like Behavior (Existing)

**Key File:** `apps/playwright/src/humanize.ts`

Simulates natural human interactions for Playwright-based automation (LinkedIn, ATS form filling).

### Functions

#### `humanDelay(minMs, maxMs)`
Random delay using a beta-like distribution that favors shorter waits with occasional longer pauses.

```
wait = min + (random^1.4) * (max - min)
```

#### `humanType(page, selector, text)`
Types text character-by-character with realistic timing:
- **Per-keystroke delay**: ~60ms base with triangular variance (~80ms range)
- **Thinking pauses**: Every 8-15 characters, pauses for 200-500ms
- **Long text fallback**: Text over 200 characters uses `page.fill()` for efficiency

#### `humanClick(page, selector)`
Clicks with natural mouse movement:
1. Waits for element visibility
2. Gets bounding box, calculates a random point within the element (not dead center)
3. Moves mouse to target with smooth interpolation (5-10 steps)
4. Pre-click pause (100-300ms)
5. Click
6. Post-click pause (200-600ms)

#### `humanScroll(page, pixels)`
Scrolls in 2-4 smaller increments with delays between each, rather than one large jump.

#### `waitForFullLoad(page)`
Waits for both `domcontentloaded` and `load` events, then adds a 2-4 second delay for async UI rendering (LinkedIn loads content progressively).

### Usage
All LinkedIn automation (`linkedin.ts`, `linkedin-easy-apply.ts`) imports these functions instead of using inline delays.

---

## Layer 2: Proxy Rotation (Planned)

**Reference Implementation:** JobSpy's `RotatingProxySession` in `apps/example-code/JobSpy/jobspy/util.py`

### Why Needed

Humanization alone works for low-volume LinkedIn use (5-20 searches/day). For scaling to multiple boards or higher volume:
- Indeed and Glassdoor fingerprint and block IPs after repeated requests
- LinkedIn rate-limits around page 10 of results with a single IP
- A single blocked IP halts all automation

### JobSpy's Approach (Python)

JobSpy implements proxy rotation with these key classes:

- **`RotatingProxySession`** — round-robin proxy selection from a list
- **`RequestsRotating`** — `requests.Session` subclass that rotates proxies per request
- **`TLSRotating`** — `tls_client.Session` subclass with TLS fingerprint spoofing + proxy rotation
- **`create_session()`** — factory function that picks TLS vs standard session, configures retries and CA certs

Key features:
- Round-robin rotation (cycles through proxy list)
- TLS client support (`tls-client` library) to spoof browser TLS fingerprints
- CA certificate support for MITM proxies
- Automatic retry with exponential backoff
- Per-request proxy switching

### Proposed Implementation for Playwright Service

#### Option A: Playwright Proxy Config (Recommended for Browser Automation)

Playwright natively supports proxy configuration per browser context:

```typescript
// apps/playwright/src/browser.ts
import { chromium } from 'playwright'

const PROXY_LIST = process.env.PROXY_LIST?.split(',') ?? []
let proxyIndex = 0

function getNextProxy() {
  if (PROXY_LIST.length === 0) return undefined
  const proxy = PROXY_LIST[proxyIndex % PROXY_LIST.length]
  proxyIndex++
  const [server, username, password] = parseProxy(proxy)
  return { server, username, password }
}

export async function createBrowserContext() {
  const proxy = getNextProxy()
  const browser = await chromium.launch({
    headless: true,
    proxy: proxy ? { server: proxy.server } : undefined,
  })
  return browser.newContext({
    proxy,
    userAgent: getRandomUserAgent(),
  })
}
```

#### Option B: JobSpy Service Handles Its Own Proxies

For the JobSpy microservice (`apps/jobspy/`), proxies are passed directly to `scrape_jobs()`:

```python
# apps/jobspy/main.py
jobs = scrape_jobs(
    site_name=sites,
    search_term=search_term,
    proxies=proxy_list,  # JobSpy handles rotation internally
)
```

No additional proxy code needed — JobSpy's `RotatingProxySession` handles it.

#### Option C: Hybrid (Both)

- **Playwright service** uses Option A for LinkedIn and ATS automation
- **JobSpy service** uses Option B for multi-board scraping
- Both read from the same `PROXY_LIST` env var

### Proxy Configuration

```yaml
# docker-compose.playwright.yml
services:
  playwright:
    environment:
      - PROXY_LIST=http://user:pass@proxy1:8080,http://user:pass@proxy2:8080
  jobspy:
    environment:
      - PROXY_LIST=http://user:pass@proxy1:8080,http://user:pass@proxy2:8080
```

Settings UI in `apps/web/src/components/settings/ConnectionsSection.tsx`:
- Proxy list input (comma-separated or one per line)
- Test proxy button (hits a known endpoint to verify connectivity)
- Status indicator per proxy (working/failed/slow)

### Proxy Providers to Consider

| Provider | Type | Price | Notes |
|---|---|---|---|
| Residential rotating | Best for Indeed/Glassdoor | $5-15/GB | Hardest to detect |
| Datacenter rotating | Good for LinkedIn/Google | $1-3/GB | Fast but more detectable |
| Free proxy lists | Testing only | Free | Unreliable, often blocked |
| Self-hosted (VPN) | Good for low volume | VPN cost | Single IP per VPN |

---

## Layer 3: Additional Anti-Detection (Future)

### User-Agent Rotation
Rotate realistic browser user-agent strings per session:

```typescript
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
  // ...
]
```

### Browser Fingerprint Diversity
- Randomize viewport size within realistic ranges
- Vary timezone, language, platform per context
- Use `playwright-extra` with `stealth` plugin for advanced fingerprint masking

### Rate Limiting Strategy

| Board | Max Requests/Min | Session Duration | Cooldown |
|---|---|---|---|
| LinkedIn | 2-3 | 15 min max | 30 min between sessions |
| Indeed | 5-8 | 10 min max | 15 min between sessions |
| Glassdoor | 3-5 | 10 min max | 20 min between sessions |
| Google Jobs | 10-15 | No limit | Minimal |

### Key Files

- `apps/playwright/src/humanize.ts` — existing humanization functions
- `apps/playwright/src/browser.ts` — browser context creation (add proxy support)
- `apps/playwright/src/shared/` — shared utilities
- `apps/example-code/JobSpy/jobspy/util.py` — reference proxy rotation implementation
