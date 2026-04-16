# Docker Build & Caching Strategy

This project runs three services via Docker Compose. Each has different dependency profiles and caching needs. This doc captures what works, what didn't, and the rationale behind the current setup.

## Service Overview

| Service | Base Image | Heavy Dependencies | Build Time (uncached) |
|---------|-----------|-------------------|----------------------|
| **web** | `oven/bun:1.3.4` | npm packages via `bun install` | ~30s |
| **llm** | `python:3.11-slim` | llama-cpp-python (compiles from source), sentence-transformers, scikit-learn | ~3 min |
| **playwright** | `oven/bun:1.3.4` | Chromium browser binary (~200MB) | ~1 min |

## Evolution

The Docker setup has gone through several iterations:

1. **Initial setup** (`e119729`, Mar 6) — Single `docker-compose.yml` with a pnpm/Node web Dockerfile. Had Playwright browsers baked into the web image. Used `--mount=type=cache,target=/pnpm/store` for pnpm.

2. **Service split + Bun migration** (`db5953a`, Mar 9) — Broke into three separate compose files (`web`, `llm`, `playwright`). Migrated web from pnpm/Node to Bun. Moved Playwright out of the web image into its own service. Created the LLM Dockerfile with `uv:latest` (which later caused cache problems). Introduced `docker-dev.mjs` for the interactive launcher.

3. **Second cache mount for web** (`9eaa091`, Mar 10) — Added `/root/.bun/cache` mount and `BUN_INSTALL_CACHE_DIR` env var to the web Dockerfile. Switched to `--frozen-lockfile`. This made web rebuilds significantly faster.

4. **Pin uv + add LLM cache mount** (current) — Pinned `uv:0.10.10` to stop the `:latest` tag from busting the entire LLM build cache. Added `--mount=type=cache,target=/root/.cache/uv` so even forced rebuilds reuse downloaded wheels. Added `.dockerignore` for the LLM service.

## Cache-Busting Pitfalls (What Didn't Work)

### Using `:latest` tags for multi-stage COPY

```dockerfile
# BAD: busts cache every time the upstream image publishes a new tag
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
```

This was the single biggest source of unnecessary rebuilds. Docker resolves `:latest` to a digest, and when the upstream image changes, the `COPY` layer gets a new hash. Since Docker layer caching is sequential, **every layer after the changed one also rebuilds** — including the expensive `uv pip install` step (~168s).

**Fix:** Pin to an exact version: `COPY --from=ghcr.io/astral-sh/uv:0.10.10 /uv /bin/uv`

### Copying source files before dependency install

```dockerfile
# BAD: any code change invalidates the pip install layer
COPY . .
RUN pip install -r requirements.txt
```

We avoided this from the start, but it's worth documenting. Always copy the dependency manifest (`package.json`, `pyproject.toml`) first, install, then copy source code. This way code changes don't invalidate the dependency layer.

### Missing .dockerignore

Without a `.dockerignore`, the build context includes `__pycache__/`, `.env`, `*.log`, and other junk. Even if these files aren't used in the Dockerfile, they inflate the build context sent to the Docker daemon. More importantly, if a `COPY . .` is used, changing any of these files busts the cache.

## Current Strategy Per Service

### Web (`apps/web/Dockerfile`)

Multi-stage build with BuildKit cache mounts — the gold standard for this project.

**Key techniques:**
- **Multi-stage build**: `deps` -> `builder` -> `runner` stages keep the final image small
- **BuildKit cache mounts** for bun's install cache:
  ```dockerfile
  RUN --mount=type=cache,target=/root/.bun/install/cache \
      --mount=type=cache,target=/root/.bun/cache \
      bun install --frozen-lockfile
  ```
  This persists bun's download cache across builds, so even when the layer rebuilds (lockfile changed), packages already on disk aren't re-downloaded
- **Dependency manifest first**: all `package.json` files copied before `bun install`, source copied after
- **Pinned base image**: `oven/bun:1.3.4`

### LLM (`apps/llm/Dockerfile`)

Single-stage build optimized for the expensive Python compilation step.

**Key techniques:**
- **Pinned uv version**: `COPY --from=ghcr.io/astral-sh/uv:0.10.10 /uv /bin/uv` — prevents cache invalidation from upstream releases
- **BuildKit cache mount** for uv's download cache:
  ```dockerfile
  RUN --mount=type=cache,target=/root/.cache/uv \
      uv pip install --system .
  ```
  Even when `pyproject.toml` changes, cached wheels (especially the slow-to-compile `llama-cpp-python`) don't re-download
- **pyproject.toml copied before source**: `COPY pyproject.toml ./` then `RUN uv pip install`, then `COPY *.py ./`
- **Volumes for models**: model files live in a Docker volume (`llm-models:/app/models`), not baked into the image

### Playwright (`apps/playwright/Dockerfile`)

Straightforward layer ordering — the Chromium install is the slow step.

**Key techniques:**
- **package.json first**: `COPY package.json ./` then `RUN bun install`
- **Chromium installed after deps**: `RUN bunx playwright install chromium` depends on the bun install layer but is cached as long as `package.json` doesn't change
- **Source code last**: `COPY src ./src` — only code changes bust this layer
- **Persistent data volume**: `playwright-data:/app/data` for LinkedIn browser session

## Layer Ordering Rules

For any Dockerfile in this project, follow this order:

1. Base image (pinned tag)
2. System packages (`apt-get`)
3. External tools (pinned version tags)
4. Dependency manifests only (`package.json`, `pyproject.toml`)
5. Dependency installation (with BuildKit cache mounts where available)
6. Source code
7. Runtime config (user creation, volumes, healthcheck, CMD)

## BuildKit Cache Mounts

BuildKit cache mounts (`--mount=type=cache,target=...`) persist a directory across builds at the Docker daemon level. Unlike layer caching, they survive even when the layer itself is invalidated.

| Service | Cache target | What it caches |
|---------|-------------|---------------|
| web | `/root/.bun/install/cache`, `/root/.bun/cache` | Downloaded npm tarballs |
| llm | `/root/.cache/uv` | Downloaded Python wheels (including compiled llama-cpp-python) |

**Requirement:** BuildKit must be enabled. Docker Desktop enables it by default. For CI, set `DOCKER_BUILDKIT=1`.

## Compose Files

Each service has its own compose file to allow mix-and-match via `docker-dev.mjs`:

- `docker-compose.web.yml` — web app
- `docker-compose.llm.yml` — LLM service
- `docker-compose.playwright.yml` — Playwright service

All services share the `coolify` network (created automatically by the dev script).

## Updating Pinned Versions

When bumping a pinned dependency:

- **uv**: Change the tag in `apps/llm/Dockerfile` (`COPY --from=ghcr.io/astral-sh/uv:X.Y.Z`). First build after the bump will re-download, subsequent builds cache normally.
- **Bun**: Change the tag in `FROM oven/bun:X.Y.Z` in both `apps/web/Dockerfile` and `apps/playwright/Dockerfile`.
- **Python**: Change `FROM python:3.XX-slim` in `apps/llm/Dockerfile`.
