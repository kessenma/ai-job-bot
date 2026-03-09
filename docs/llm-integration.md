# LLM Service Integration Guide

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Docker Compose                                      │
│                                                      │
│  ┌─────────────┐      ┌──────────────────────────┐   │
│  │  web :3000   │──────│  llm :8083               │   │
│  │  TanStack    │ HTTP │  Python FastAPI           │   │
│  │  Start       │      │  llama-cpp-python         │   │
│  └─────────────┘      │                          │   │
│                        │  Models (Docker volume):  │   │
│                        │  ├── 1B (0.8GB)          │   │
│                        │  ├── 3B (2.0GB)          │   │
│                        │  └── 7B (4.9GB)          │   │
│                        └──────────────────────────┘   │
│                                                      │
│  ┌─────────────────────────┐                         │
│  │  Bun server (embedded)  │                         │
│  │  apps/server :random    │──── proxies /api/llm/*  │
│  │  (React Native backend) │     to llm:8083         │
│  └─────────────────────────┘                         │
└──────────────────────────────────────────────────────┘
```

## What Exists Today

### LLM Service (`apps/llm/`)
- **main.py**: FastAPI service with endpoints:
  - `GET /health` — service health + active model
  - `GET /models/status` — all 3 models with download progress (0-100%), status, active flag
  - `POST /switch-model` — triggers download (background) + load; returns immediately
  - `POST /generate-cover-letter` — generates cover letter from job details + samples
  - `GET /model-info` — detailed info on loaded model
- **Dockerfile**: Single-stage python:3.11-slim, no model baked in
- **Models**: Downloaded on demand into `/app/models/` Docker volume (`llm-models`)

### API Bridges (already wired up)
- **Web app**: `apps/web/src/lib/llm.api.ts` — TanStack Start server functions (`getLlmStatus`, `getLlmModels`, `switchLlmModel`, `generateCoverLetter`)
- **Bun server**: `apps/server/src/routes/llm.ts` — proxy routes at `/api/llm/*`
- **RN client**: `apps/react-native/src/api/llm.ts` — typed API client with `ModelStatusInfo` interface

### PDF Text Extraction
- `apps/web/src/lib/uploads.server.ts` has `readCoverLetterTexts()` and `readResumeText()` using `pdf-parse`
- These are called automatically in `generateCoverLetter()` to send sample text to the LLM

### Docker Compose (`docker-compose.yml`)
- `llm` service on port 8083, 10GB memory limit, `llm-models` volume
- `web` service has `LLM_SERVICE_URL: http://llm:8083` env var
- `DEFAULT_MODEL: ""` — no model auto-downloaded; user picks via UI

### Model Status States
Each model cycles through: `idle` → `downloading` (with progress 0-100%) → `loading` → `ready`
On error: `error` with error message.

---

## Next Steps: UI Integration

### 1. Web App — Settings Page (`apps/web/src/routes/settings.tsx`)

**Replace the static "Coming Soon" section** (lines 137-148) with a live LLM status card.

**What to build:**
- Load `getLlmModels()` and `getLlmStatus()` in the route loader (add to the existing `Promise.all`)
- Create a `<LlmModelSection>` component that shows:
  - Connection status indicator (green dot if connected, red if unreachable)
  - A card for each model (1B, 3B, 7B) showing:
    - Model name + size
    - Status badge: "Not downloaded" / "Downloading X%" / "Loading..." / "Active" / "Error"
    - Progress bar when `status === "downloading"` using `download_progress`
    - "Download & Activate" button (calls `switchLlmModel({ modelId })`)
    - "Activate" button if downloaded but not active
  - Active model highlighted
- **Polling**: When any model has `status === "downloading"` or `status === "loading"`, poll `getLlmModels()` every 5 seconds. Stop polling when all models are idle/ready.

**Key API calls:**
```typescript
import { getLlmStatus, getLlmModels, switchLlmModel } from '#/lib/llm.api.ts'

// In route loader:
const llmModels = await getLlmModels()  // { models: [...], current_model: "3b" | null }
const llmStatus = await getLlmStatus()  // { connected: boolean, status: string, ... }

// On button click:
await switchLlmModel({ data: { modelId: '3b' } })
// Then start polling getLlmModels() every 5s until status === "ready"
```

**Imports to add to settings.tsx:**
```typescript
import { getLlmStatus, getLlmModels, switchLlmModel } from '#/lib/llm.api.ts'
import { Download, Cpu, Loader2 } from 'lucide-react'  // icons
```

### 2. Web App — Dockerfile (`apps/web/Dockerfile`)

**Add `packages/shared` to the build** (if not already):
```dockerfile
# In deps stage, add:
COPY packages/shared/package.json packages/shared/package.json

# In builder stage, add:
COPY packages/shared packages/shared
```

**No other Dockerfile changes needed** — the web app communicates with the LLM service via `LLM_SERVICE_URL` env var over the Docker network.

### 3. React Native — Settings Screen (`apps/react-native/src/screens/SettingsScreen.tsx`)

**Add an "AI Models" card** below the existing "Google API" and "App Info" cards.

**What to build:**
- Import from `../api/llm`: `getLlmHealth`, `getLlmModels`, `switchLlmModel`
- On mount, call `getLlmModels()` alongside existing status loads
- Display a card with:
  - "Cover Letter AI" title
  - Connection status (green/red dot based on `getLlmHealth()`)
  - List of 3 models, each with:
    - Name + size label
    - Status text: "Not downloaded" / "Downloading 45%" / "Loading..." / "Active"
    - A simple progress bar (`View` with percentage width) when downloading
    - "Download" / "Activate" / "Active" button per model
  - Pressing "Download" calls `switchLlmModel(modelId)` then starts a `setInterval` polling `getLlmModels()` every 5 seconds

**Polling pattern (same as reference project):**
```typescript
useEffect(() => {
  const isActive = models.some(m => m.status === 'downloading' || m.status === 'loading');
  if (!isActive) return;
  const interval = setInterval(async () => {
    const result = await getLlmModels();
    setModels(result.models);
    if (!result.models.some(m => m.status === 'downloading' || m.status === 'loading')) {
      clearInterval(interval);
    }
  }, 5000);
  return () => clearInterval(interval);
}, [models]);
```

**Types already available in `api/llm.ts`:**
```typescript
export interface ModelStatusInfo {
  id: string
  name: string
  size_gb: number
  downloaded: boolean
  active: boolean
  status: 'idle' | 'downloading' | 'loading' | 'ready' | 'error'
  download_progress: number // 0-100
  current_step: string
  error?: string | null
}
```

### 4. React Native — Setup Wizard (`apps/react-native/src/screens/SetupWizardScreen.tsx`)

**Add a new step** after Google API setup (step 2) for model selection.

**What to build:**
- Add `step === 2` screen: "Choose Your AI Model"
- Show the 3 model options as selectable cards:
  - **1B** — "Fast, lightweight. Good for quick drafts." (0.8GB)
  - **3B** — "Recommended. Best balance of quality and speed." (2.0GB) ← default highlight
  - **7B** — "Highest quality. Slower, uses more memory." (4.9GB)
- "Download & Continue" button that:
  1. Calls `switchLlmModel(selectedModelId)`
  2. Shows a progress bar polling `getLlmModels()` every 5s
  3. When `status === "ready"`, navigates to Main
- "Skip for now" link (navigates to Main without downloading)

**Step flow becomes:**
```
step 0: Welcome → "Get Started"
step 1: Google API keys → "Save & Continue"
step 2: Choose AI model → "Download & Continue" (or "Skip")
→ Navigate to Main
```

### 5. Docker Compose — No Changes Needed

The current `docker-compose.yml` is complete. Both `web` and `llm` services are configured. The web service already has `LLM_SERVICE_URL: http://llm:8083`.

To run everything: `docker compose up -d`

---

## API Reference (Quick)

### GET /models/status
```json
{
  "models": [
    { "id": "1b", "name": "Llama-3.2-1B-Instruct", "size_gb": 0.8, "downloaded": false, "active": false, "status": "idle", "download_progress": 0.0, "current_step": "", "error": null },
    { "id": "3b", "name": "Llama-3.2-3B-Instruct", "size_gb": 2.0, "downloaded": true, "active": true, "status": "ready", "download_progress": 100.0, "current_step": "", "error": null }
  ],
  "current_model": "3b"
}
```

### POST /switch-model
```json
// Request
{ "model_id": "3b" }

// Response (immediate — download happens in background)
{ "ok": true, "model": "Llama-3.2-3B-Instruct", "status": "downloading" }
// or if already downloaded:
{ "ok": true, "model": "Llama-3.2-3B-Instruct", "status": "ready" }
```

### POST /generate-cover-letter
```json
// Request
{
  "company": "Acme Corp",
  "role": "Software Engineer",
  "candidate_name": "Jane Doe",
  "job_description": "...",
  "location": "SF",
  "cover_letter_samples": ["Dear Hiring Manager..."],
  "resume_text": "Jane Doe — 5 years...",
  "temperature": 0.7,
  "max_length": 1024
}

// Response
{
  "cover_letter": "Dear Hiring Manager...",
  "model_info": { "model_id": "3b", "model_name": "Llama-3.2-3B-Instruct", ... },
  "usage": { "input_tokens": 90, "output_tokens": 216, "total_tokens": 306 },
  "generation_time_s": 18.27
}
```

---

## File Reference

| File | Purpose |
|------|---------|
| `apps/llm/main.py` | FastAPI LLM service (endpoints, model management, progress tracking) |
| `apps/llm/Dockerfile` | Docker image for the LLM service |
| `apps/llm/pyproject.toml` | Python dependencies |
| `docker-compose.yml` | Orchestrates web + llm services |
| `apps/web/src/lib/llm.api.ts` | TanStack Start server functions for web app |
| `apps/web/src/lib/uploads.server.ts` | PDF text extraction (`readCoverLetterTexts`, `readResumeText`) |
| `apps/server/src/routes/llm.ts` | Bun server proxy routes for React Native |
| `apps/react-native/src/api/llm.ts` | RN typed API client |
| `apps/web/src/routes/settings.tsx` | Web settings page (needs LLM section) |
| `apps/react-native/src/screens/SettingsScreen.tsx` | RN settings (needs AI models card) |
| `apps/react-native/src/screens/SetupWizardScreen.tsx` | RN setup wizard (needs model selection step) |
