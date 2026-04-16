# Mobile App Commercialization

Notes and findings from exploring the path from local personal tool → commercial mobile product.

---

## Architecture: Playwright on Mobile

Playwright **cannot run on mobile devices**. iOS and Android sandbox restrictions prevent apps from spawning and controlling browser processes. The correct architecture is:

```
React Native App  →  Server (Playwright + LLM + JobSpy)  →  Job Boards
```

The mobile client is purely UI and trigger layer. All automation runs server-side. This means:

- Jobs need to run **asynchronously** — the app fires off a job and polls for completion rather than holding an open HTTP connection
- A job queue (e.g. BullMQ, which fits the existing Node/pnpm monorepo) is the right pattern
- LinkedIn session/cookie state lives on the server, not the client

---

## LinkedIn Scraping: Legal Status

**Short answer:** Per-user credential scraping is the strongest legal position available, and enforcement risk against individual users is low.

### hiQ v. LinkedIn precedent
The court ruled that scraping **publicly available data** does not violate the Computer Fraud and Abuse Act (CFAA). When users access LinkedIn through their own authenticated accounts, the "unauthorized access" argument weakens further — they are fully authorized to be there.

### Per-user credential model
Each user authenticates with their own LinkedIn account. From LinkedIn's perspective, their own user is browsing their own account. The automation layer is invisible at the legal level. LinkedIn's enforcement against individual users for "browsing too much" essentially doesn't happen.

### LinkedIn's actual incentives
LinkedIn charges recruiters ~$8–10k/year per Recruiter seat plus significant job posting fees. Job seekers are the **supply side** of the marketplace — LinkedIn needs engaged job seekers to justify recruiter pricing. A tool that helps job seekers find and apply to more jobs on LinkedIn arguably serves LinkedIn's core value proposition.

Every Easy Apply submission your users complete is a conversion event LinkedIn can show recruiters as proof their platform works.

### Where the real risk lives
- **Account suspensions** — LinkedIn will flag accounts that look automated. The humanization layer (`apps/playwright/src/humanize.ts`) directly mitigates this. Per-user sessions distribute the fingerprint across many unique accounts.
- **ToS between LinkedIn and your users** — LinkedIn's ToS is a contract with the user, not you. If a user's account gets suspended for ToS violation, there's some exposure around causation. Mitigate with a clear ToS disclaimer stating users are responsible for their own account usage on third-party platforms.

### Not a lawyer disclaimer
None of this is legal advice. If commercializing seriously, get an actual IP/tech lawyer to review before launch.

---

## Open Source Licensing & Commercialization

This project was built with reference to several open-source repos stored in `apps/example-code/`. Understanding their licenses matters before any commercial launch.

### The AGPL problem

**AIHawk** (`Auto_Jobs_Applier_AI_Agent`) is credited under **AGPL-3.0**. AGPL is specifically designed to close the "SaaS loophole" — unlike regular GPL (which only triggers on software distribution), AGPL also triggers when you *run the software as a networked service*. If AGPL-licensed code is incorporated into this codebase and users interact with it over a network, you'd be required to publish the full source of the entire application.

### The LLM-assisted development wrinkle

The `apps/example-code/` repos were used as **human reference only** — no code was manually copied 1:1. However, LLMs were used during development and may have internalized patterns from these repos when they were provided as context. This is a genuinely novel and unresolved area of copyright law with no court precedent yet. Practical breakdown:

- **MIT-licensed repos** (JobSpy, JobFunnel, linkedin-easy-apply, Resume-CoverLetterGenerator-LLM): MIT is so permissive that even direct copying is fine commercially. Zero concern here regardless of how code was generated.
- **AGPL-licensed AIHawk**: The one to be careful about. If an LLM reproduced substantial structural or logic patterns from AIHawk into the codebase, a strict reading of AGPL could argue those sections are derived works. Courts haven't ruled on LLM-generated code and AGPL yet, and nobody is actively litigating this pattern. But it's a real, if theoretical, risk for a commercial product.
- **"Unlicensed" repos** (`cover-letter-llm`, `job-application-bot-by-ollama-ai`): Legally "all rights reserved" by default. Nobody enforces this on reference use in practice, but worth noting.

### Practical mitigation for AGPL

Review the sections most likely influenced by AIHawk reference — primarily LLM-based form-filling logic and job matching patterns — and consider doing a clean rewrite of those sections without any AIHawk context window. At that point, derivation becomes very hard to argue. The fact that AIHawk is Python-based while your stack is TypeScript/Playwright also helps — structural similarity across language boundaries weakens any derivation claim significantly.

### GSAP commercial license

GSAP's "Standard" license is free for open source projects but **requires a paid commercial license** for paid products. Budget for this before launch or swap it for an MIT-licensed animation library (Motion/Framer Motion is already in your stack and covers most use cases).

### Monorepo split licensing

Mixed licenses across a monorepo is standard practice and works cleanly. The recommended approach:

- `apps/web/` → MIT (open source, self-hostable)
- `apps/react-native/` → Proprietary (excluded from public repo via `.gitignore` or separate private repo)
- `packages/shared/`, `packages/db/` → MIT (permissive, safe to include in closed-source products)

Each `apps/` directory gets its own `LICENSE` file. The root `LICENSE` should clarify its scope excludes the mobile app. All current shared package dependencies are MIT or Apache 2.0, so no copyleft issues pulling into the closed-source mobile app.

### Not a lawyer disclaimer
None of this is legal advice. The AGPL/LLM derivation question in particular is unsettled enough that a real IP lawyer review is worthwhile if pursuing commercial launch seriously.

---

## Job Data Sources

The scraping layer is increasingly a commodity problem. Several better paths exist:

### Boards permissive to scraping/APIs
| Source | Access Method | Notes |
|---|---|---|
| **Indeed** | Scraping (permissive) | Best scraper in JobSpy, no aggressive rate limiting |
| **Google Jobs** | SerpApi | Clean, structured access |
| **ZipRecruiter** | Scraping | US/Canada, low anti-bot risk |
| **Glassdoor** | Scraping (GraphQL) | Medium anti-bot risk |
| **Greenhouse** | Public Job Board API | Explicitly designed for syndication — thousands of companies |
| **Lever** | Public API | Similar to Greenhouse, large company coverage |
| **SmartRecruiters** | Public API | Another major ATS with open job feeds |

Greenhouse/Lever/SmartRecruiters are particularly valuable: they cover most mid-to-large tech companies and the access is **explicitly sanctioned**, removing ToS risk entirely for those sources.

### Licensed data aggregators
For scale, third-party providers aggregate and resell compliant job data:
- [Coresignal](https://coresignal.com) — LinkedIn + employee data
- [LinkUp](https://linkup.com) — crawls employer career pages directly (no job board scraping), 315M+ historical postings
- [Fantastic.jobs](https://fantastic.jobs/api) — 8M+ jobs/month via API
- [TheirStack](https://theirstack.com) — combines LinkedIn, Indeed, Glassdoor, 16k+ ATS platforms

### JobSpy (open source)
[JobSpy](https://github.com/speedyapply/JobSpy) is a Python library that scrapes LinkedIn, Indeed, Glassdoor, ZipRecruiter, and Google Jobs concurrently with a unified output schema. Integration plan already documented in `docs/suggested-upgrades/multi-job-board.md`.

### The real competitive moat
The scraping layer is increasingly commoditized and legally murky at scale. The **differentiating value** in this product is the apply-side automation: filling ATS forms, handling Workday/Greenhouse/Lever flows, LLM-generated cover letters and questionnaire answers. That's the part no data provider sells and where user stickiness comes from. Job listings could eventually come from a licensed provider; the automation layer is what's hard to replicate.

---

## Cloudflare's Scraping Stance (2025)

Cloudflare moved in the **opposite** direction from scraper-friendly in 2025. As of July 2025 they:
- Block AI crawlers **by default** for all new domains
- Launched "Pay Per Crawl" — a marketplace where site owners can charge AI companies per page crawled
- Gave site owners tools to express granular crawler permissions

This primarily targets AI **training** crawlers (OpenAI, Anthropic, etc.) rather than Playwright-based automation bots, so practical impact on this product is limited. But it signals the broader direction: the web is actively moving toward gated, monetized data access, which makes licensed API relationships more valuable long-term.

---

## IP & Anti-Bot Strategy

### The core tension
A Hetzner server IP hammering job boards is a red flag. But rotating IPs on a single account is also suspicious — the session fingerprint stays consistent while the network origin keeps changing.

### Option 1: Residential proxies (recommended for commercial)
Route requests through real home IP addresses via providers like [Bright Data](https://brightdata.com) or [Oxylabs](https://oxylabs.io). These look like organic users to bot detection. JobSpy's `proxies` parameter already supports this. Cost: ~$10–15/GB depending on provider.

### Option 2: Per-user credential isolation (recommended architecture)
Each user's Playwright session runs under their own LinkedIn login. From LinkedIn's perspective, it's just their user browsing normally. The humanization layer makes the traffic pattern look organic. This is the architecturally cleanest solution and the most defensible legally.

### Option 3: Mobile IP forwarding (not recommended)
Technically possible via reverse tunnel (WireGuard/Tailscale) — the mobile app opens a persistent connection to the server, LinkedIn traffic egresses from the user's phone IP. But mobile devices are unreliable as network infrastructure (iOS kills background processes, carrier NAT, battery drain). A cleaner hybrid: the mobile app handles LinkedIn login (from the user's real device IP/fingerprint) and hands session cookies to the server for automation.

### Recommended approach
Per-user credential isolation + residential proxies as an optional power feature for users who want higher volume. The existing Playwright session architecture is already well-suited for this.

---

## Google OAuth

Google's verification process is a **blocking requirement** before any public launch. Without it:
- New users see an "unverified app" warning screen
- Google can cap the number of users entirely

Scopes for Google Sheets read/write are fairly standard and the approval process is not typically painful — but it cannot be skipped. File the verification request well before any planned launch date.

---

## Pricing Model

The key constraint: Playwright sessions are the marginal cost driver. Unlike pure SaaS, each active user can require a browser session, which is CPU/memory intensive. The LLM is cheap since it runs locally — that's a meaningful cost advantage over tools paying OpenAI per generation.

### Recommended: Usage-based credits
Users buy credits; each apply/scrape action costs credits. Aligns revenue directly with server load. Familiar pattern for users of automation tools.

### Alternative: Tiered subscription with action limits
- Basic: 50 applications/month
- Pro: 200 applications/month
- Power: unlimited (or high cap)

More predictable for users but requires accurate capacity modeling. Key question: how many concurrent Playwright sessions can the server handle? That determines how aggressively tiers can be priced and sold.

### Pricing anchors to consider
- LinkedIn Recruiter: ~$8–10k/year for the other side of the same transaction
- Resume/cover letter SaaS tools: typically $10–30/month
- Job application tracking tools: typically $5–15/month
- The automation value is substantially higher than any of those — pricing should reflect that

---

## Launch Checklist (Pre-Commercial)

- [ ] Google OAuth verification submitted and approved
- [ ] ToS drafted with third-party platform disclaimer
- [ ] Per-user credential isolation confirmed in Playwright session architecture
- [ ] Rate limiting / request throttling per user account on the server
- [ ] Job queue implemented for async Playwright jobs (BullMQ or equivalent)
- [ ] Residential proxy support wired into JobSpy service config
- [ ] App Store review of LinkedIn/automation tool policies (both Apple and Google have relevant guidelines)
- [ ] AGPL audit: review form-filling and job matching logic for AIHawk-derived patterns; rewrite any flagged sections cleanly
- [ ] GSAP commercial license purchased (or replaced with Motion which is already in the stack)
- [ ] Root `LICENSE` scoped to exclude `apps/react-native/`; mobile app moved to private repo or `.gitignore`d
- [ ] Legal review of ToS, scraping approach, and AGPL exposure if pursuing commercial launch seriously
