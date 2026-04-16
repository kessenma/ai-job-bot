FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV MODEL_DIR=/app/models
ENV DEFAULT_MODEL=""
ENV TRANSFORMERS_CACHE=/app/cache
ENV HF_HOME=/app/cache
ENV N_CTX=4096
ENV N_THREADS=8
ENV N_GPU_LAYERS=0
ENV PORT=8083

# Install system deps for llama-cpp-python compilation + curl for healthcheck
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    python3-dev \
    cmake \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install uv (pinned to avoid cache-busting on new releases)
COPY --from=ghcr.io/astral-sh/uv:0.10.10 /uv /bin/uv

# Install Python dependencies (cache mount survives layer rebuilds)
COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system .

# Copy application code
COPY *.py ./

# Models and cache directories will be mounted as volumes
RUN mkdir -p /app/models /app/cache

EXPOSE 8083

HEALTHCHECK --interval=30s --timeout=15s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8083/health || exit 1

CMD ["python", "main.py"]
