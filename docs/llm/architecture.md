# LLM Service Architecture

The LLM service (`apps/llm/`) is a FastAPI Python app that runs local GGUF models via `llama-cpp-python` and exposes a REST API for the rest of the monorepo.

## Module layout

```
apps/llm/
├── main.py           # FastAPI app, lifespan, all route handlers
├── config.py         # Environment config and AVAILABLE_MODELS registry
├── schemas.py        # Pydantic request/response models
├── model_manager.py  # Global model state, download/load/unload logic
├── prompts.py        # Multi-format prompt builders (Llama 3 + ChatML)
└── embed.py          # Sentence-transformers embedding model (all-MiniLM-L6-v2)
```

## Module responsibilities

### `config.py`
Reads environment variables (`MODEL_DIR`, `DEFAULT_MODEL`, `N_CTX`, `N_THREADS`, `N_GPU_LAYERS`) and defines the `AVAILABLE_MODELS` dict mapping short IDs (`1b`, `3b`, `7b`, `qwen7b`) to their HuggingFace repo/filename/local metadata.

Each model entry includes a `prompt_format` key (`"llama3"` or `"chatml"`) that `prompts.py` uses to select the correct chat template and stop tokens at runtime.

### `schemas.py`
All Pydantic `BaseModel` classes for API request and response bodies. Nothing else — no business logic.

### `model_manager.py`
Owns all mutable LLM state:
- `llm` — the active `Llama` instance (or `None`)
- `active_model_id` — which model is loaded
- `_model_status` — per-model dict tracking `status`, `download_progress`, `current_step`, `error`
- `_switch_lock` — mutex preventing concurrent model switches

Key functions:
- `download_model(model_id)` — pulls GGUF from HuggingFace Hub; spawns a background thread to track file-size-based download progress
- `load_model(model_id)` — unloads any current model, then loads the target via `llama_cpp.Llama`
- `unload_model()` — frees the `Llama` object and runs GC
- `switch_model_background(model_id)` — chains download + load for background use

> **Important:** `main.py` imports this module as `import model_manager as mm` and always accesses state as `mm.llm`, `mm.active_model_id`, etc. Direct `from model_manager import llm` imports would copy the `None` value at import time and miss later assignments.

### `prompts.py`
Builds chat-formatted prompt strings for each task, with support for multiple model families via a `model_id` dispatch pattern.

**Supported formats:**

- `llama3` — Llama 3.x chat format (`<|begin_of_text|>`, header tokens, `<|eot_id|>`)
- `chatml` — ChatML format used by Qwen and others (`<|im_start|>`, `<|im_end|>`)

**Public API:**

- `get_stop_tokens(model_id)` — returns the correct stop token list for the active model; used in all `llm()` calls in `main.py`
- `build_chat_prompt(system_msg, user_msg, model_id)` — generic dispatcher; selects the right template based on `model_id`'s `prompt_format` in config
- `build_score_job_prompt(req, model_id)` — HR scoring prompt, expects JSON `{"score": 1-10, "reason": "..."}`
- `build_cover_letter_prompt(req, model_id)` — cover letter prompt with optional samples/resume context

All task-specific builders accept an optional `model_id` (defaults to `""` → falls back to `llama3`) and delegate to `build_chat_prompt` for template selection. Adding a new model family requires only adding its format key to `config.py` and implementing a new `_build_<format>_prompt` function here.

### `embed.py`
Loads `all-MiniLM-L6-v2` via `sentence-transformers` once at startup (in a daemon thread so it doesn't block). Exposes `embed_text(text) -> list[float]` returning a 384-dim normalized vector.

### `main.py`
Thin orchestration layer:
- `lifespan` context manager: boots the embedding model, marks already-downloaded models as ready, optionally loads `DEFAULT_MODEL`
- Route handlers for `/health`, `/embed`, `/models`, `/model-info`, `/chat`, `/switch-model`, `/score-job`, `/generate-cover-letter`, `/delete-model`
- `get_memory_usage()` helper using `psutil`

Each generation endpoint (`/chat`, `/score-job`, `/generate-cover-letter`) calls `get_stop_tokens(mm.active_model_id)` and passes `mm.active_model_id` into the prompt builder so stop tokens and prompt format are always in sync with whichever model is loaded.

## Model lifecycle

```
idle ──[POST /switch-model]──► downloading ──► loading ──► ready
                                                             │
                                              [POST /delete-model]
                                                             ▼
                                                           idle
```

Downloading runs in a background thread. Clients poll `GET /models/status` to track progress. Loading is synchronous if the file is already present (fast path).

## Available models

| ID      | Name                    | Size    | Format  |
|---------|-------------------------|---------|---------|
| 1b      | Llama-3.2-1B-Instruct   | ~0.8 GB | llama3  |
| 3b      | Llama-3.2-3B-Instruct   | ~2.0 GB | llama3  |
| 7b      | Llama-3.1-8B-Instruct   | ~4.9 GB | llama3  |
| qwen7b  | Qwen2.5-7B-Instruct     | ~4.7 GB | chatml  |

All are Q4_K_M quantized GGUF files pulled from Bartowski's HuggingFace repos.

> **Memory note:** Both `7b` and `qwen7b` use ~5.5–6 GB RAM at runtime. On an 8 GB server they are workable but leave little headroom alongside the embedding model and OS overhead — `3b` is the safer default for prod stability at that tier. On 16 GB either runs comfortably.

## Key environment variables

| Variable        | Default    | Description                              |
|-----------------|------------|------------------------------------------|
| `MODEL_DIR`     | `./models` | Where GGUF files are stored              |
| `DEFAULT_MODEL` | *(none)*   | Model ID to auto-load on startup         |
| `N_CTX`         | `4096`     | Context window size                      |
| `N_THREADS`     | `8`        | CPU threads for inference                |
| `N_GPU_LAYERS`  | `0`        | Layers to offload to GPU (0 = CPU only)  |
| `PORT`          | `8083`     | HTTP port                                |
