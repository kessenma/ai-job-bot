FROM node:20-slim

# Install pnpm and Playwright system dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apt-get update && apt-get install -y \
    libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 \
    libxshmfence1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace config first for layer caching
COPY pnpm-workspace.yaml package.json ./
COPY packages/db/package.json packages/db/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

# Install Playwright browsers
RUN cd apps/web && npx playwright install chromium

# Copy source
COPY packages/db/ packages/db/
COPY apps/web/ apps/web/

RUN pnpm --filter web build

# Persistent data directory (mounted as Docker volume)
# Contains: SQLite DB, uploads (resume, cover letters), OAuth tokens
RUN mkdir -p /app/data/uploads/resume /app/data/uploads/cover-letter

EXPOSE 3000

ENV DATA_DIR=/app/data

CMD ["node", "apps/web/.output/server/index.mjs"]
