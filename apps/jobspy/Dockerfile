FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=8085

# Install curl for healthcheck
RUN apt-get update && apt-get install -y \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install uv (pinned to avoid cache-busting on new releases)
COPY --from=ghcr.io/astral-sh/uv:0.10.10 /uv /bin/uv

# Install Python dependencies (cache mount survives layer rebuilds)
COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system .

# Copy application code
COPY main.py ./
COPY jobspy/ ./jobspy/

EXPOSE 8085

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8085/health || exit 1

CMD ["python", "main.py"]
