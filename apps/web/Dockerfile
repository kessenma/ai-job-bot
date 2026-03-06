# syntax=docker/dockerfile:1.6
# apps/web/Dockerfile - TanStack Start app with pnpm monorepo

FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---- Install dependencies ----
FROM base AS deps
WORKDIR /app

# Copy workspace config and lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy package.json for each workspace package
COPY apps/web/package.json apps/web/package.json
COPY apps/llm/package.json apps/llm/package.json
COPY packages/db/package.json packages/db/package.json

# Install all dependencies with BuildKit cache for pnpm store
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Install Playwright browsers (needed for auto-apply)
RUN cd apps/web && npx playwright install chromium && \
    npx playwright install-deps chromium

# ---- Build ----
FROM base AS builder
WORKDIR /app

# Copy installed dependencies from deps stage
COPY --from=deps /app/ ./

# Copy source code
COPY packages/db packages/db
COPY apps/llm apps/llm
COPY apps/web apps/web

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Build the web app
RUN pnpm --filter web build

# ---- Production runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install Playwright system dependencies for runtime
RUN apt-get update && apt-get install -y \
    libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 \
    libxshmfence1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 appuser && \
    useradd --system --uid 1001 --gid appuser appuser

# Copy build output
COPY --from=builder --chown=appuser:appuser /app/apps/web/.output ./.output

# Copy Playwright browsers from deps stage
COPY --from=deps /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright
RUN chown -R appuser:appuser /home/appuser/.cache

# Create persistent data directory
RUN mkdir -p /app/data/uploads/resume /app/data/uploads/cover-letter && \
    chown -R appuser:appuser /app/data

USER appuser

EXPOSE 3000

ENV PORT=3000
ENV HOST="0.0.0.0"
ENV DATA_DIR=/app/data

CMD ["node", ".output/server/index.mjs"]
