# syntax=docker/dockerfile:1.6
# apps/web/Dockerfile - TanStack Start app with Bun

FROM oven/bun:1.3.4 AS base

# ---- Install dependencies ----
FROM base AS deps
WORKDIR /app

# Copy workspace config and lockfile
COPY pnpm-workspace.yaml package.json ./
COPY bun.lock ./

# Copy package.json for each workspace package
COPY apps/web/package.json apps/web/package.json
COPY apps/llm/package.json apps/llm/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/react-native/package.json apps/react-native/package.json
COPY apps/playwright/package.json apps/playwright/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install dependencies with BuildKit cache
RUN --mount=type=cache,target=/root/.bun/install/cache \
    --mount=type=cache,target=/root/.bun/cache \
    BUN_INSTALL_CACHE_DIR=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ---- Build ----
FROM base AS builder
WORKDIR /app

# Copy everything from deps (node_modules, workspace structure)
COPY --from=deps /app/ ./

# Copy source code
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY apps/llm apps/llm
COPY apps/web apps/web

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Build the web app (outputs to apps/web/dist/)
RUN cd apps/web && bun run build

# ---- Production runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN groupadd --system --gid 1001 appuser && \
    useradd --system --uid 1001 --gid appuser appuser

# Copy build output, node_modules, and package files preserving workspace structure
COPY --from=builder --chown=appuser:appuser /app/package.json ./package.json
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/apps/web/dist ./apps/web/dist
COPY --from=builder --chown=appuser:appuser /app/apps/web/server.ts ./apps/web/server.ts
COPY --from=builder --chown=appuser:appuser /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder --chown=appuser:appuser /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=appuser:appuser /app/packages/db ./packages/db
COPY --from=builder --chown=appuser:appuser /app/packages/shared ./packages/shared

# Create persistent data directory
RUN mkdir -p /app/data/uploads/resume /app/data/uploads/cover-letter && \
    chown -R appuser:appuser /app/data

USER appuser

EXPOSE 3000

ENV PORT=3000
ENV HOST="0.0.0.0"
ENV DATA_DIR=/app/data

CMD ["bun", "apps/web/server.ts"]
