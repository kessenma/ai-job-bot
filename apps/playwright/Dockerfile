FROM oven/bun:1.3.4

WORKDIR /app

# Install Playwright system dependencies + Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 \
    libxshmfence1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN bun install
RUN bunx playwright install chromium

# Create non-root user
RUN groupadd --system --gid 1001 appuser && \
    useradd --system --uid 1001 --gid appuser --create-home appuser

COPY src ./src

# Copy Playwright browsers to appuser home
RUN mkdir -p /home/appuser/.cache && \
    cp -r /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright && \
    chown -R appuser:appuser /home/appuser/.cache

USER appuser

EXPOSE 8084

ENV PORT=8084

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8084/health || exit 1

CMD ["bun", "run", "src/server.ts"]
