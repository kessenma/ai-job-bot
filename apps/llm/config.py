import os

# Set environment variables for optimal CPU performance
os.environ["OMP_NUM_THREADS"] = "8"
os.environ["MKL_NUM_THREADS"] = "8"
os.environ["OPENBLAS_NUM_THREADS"] = "8"

MODEL_DIR = os.getenv("MODEL_DIR", "./models")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "")
N_CTX = int(os.getenv("N_CTX", "4096"))
N_THREADS = int(os.getenv("N_THREADS", "8"))
N_GPU_LAYERS = int(os.getenv("N_GPU_LAYERS", "0"))

# Claude CLI configuration
CLAUDE_CLI_PATH = os.getenv("CLAUDE_CLI_PATH", "")

AVAILABLE_MODELS = {
    "1b": {
        "name": "Llama-3.2-1B-Instruct",
        "repo": "bartowski/Llama-3.2-1B-Instruct-GGUF",
        "filename": "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
        "local_name": "llama-3.2-1b-instruct-q4.gguf",
        "size_gb": 0.8,
        "prompt_format": "llama3",
    },
    "3b": {
        "name": "Llama-3.2-3B-Instruct",
        "repo": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "filename": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "local_name": "llama-3.2-3b-instruct-q4.gguf",
        "size_gb": 2.0,
        "prompt_format": "llama3",
    },
    "7b": {
        "name": "Llama-3.1-8B-Instruct",
        "repo": "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
        "filename": "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
        "local_name": "llama-3.1-8b-instruct-q4.gguf",
        "size_gb": 4.9,
        "prompt_format": "llama3",
    },
    "qwen7b": {
        "name": "Qwen2.5-7B-Instruct",
        "repo": "bartowski/Qwen2.5-7B-Instruct-GGUF",
        "filename": "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        "local_name": "qwen2.5-7b-instruct-q4.gguf",
        "size_gb": 4.7,
        "prompt_format": "chatml",
    },
}

# CLI-based models (no download/load needed — spawns CLI process)
CLI_MODELS = {
    "claude/claude-sonnet-4-20250514": {
        "name": "Claude Sonnet 4",
        "provider": "claude",
        "context_window": 200000,
    },
    "claude/claude-haiku-4-20250414": {
        "name": "Claude Haiku 4",
        "provider": "claude",
        "context_window": 200000,
    },
}
