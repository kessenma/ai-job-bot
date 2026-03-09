import os
import json
import logging
import gc
import time
import threading
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
from pathlib import Path

import embed as embed_module

# Set environment variables for optimal CPU performance
os.environ["OMP_NUM_THREADS"] = "8"
os.environ["MKL_NUM_THREADS"] = "8"
os.environ["OPENBLAS_NUM_THREADS"] = "8"

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from llama_cpp import Llama
import psutil

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration ---

MODEL_DIR = os.getenv("MODEL_DIR", "./models")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "")
N_CTX = int(os.getenv("N_CTX", "4096"))
N_THREADS = int(os.getenv("N_THREADS", "8"))
N_GPU_LAYERS = int(os.getenv("N_GPU_LAYERS", "0"))

AVAILABLE_MODELS = {
    "1b": {
        "name": "Llama-3.2-1B-Instruct",
        "repo": "bartowski/Llama-3.2-1B-Instruct-GGUF",
        "filename": "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
        "local_name": "llama-3.2-1b-instruct-q4.gguf",
        "size_gb": 0.8,
    },
    "3b": {
        "name": "Llama-3.2-3B-Instruct",
        "repo": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "filename": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "local_name": "llama-3.2-3b-instruct-q4.gguf",
        "size_gb": 2.0,
    },
    "7b": {
        "name": "Llama-3.1-7B-Instruct",
        "repo": "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
        "filename": "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
        "local_name": "llama-3.1-8b-instruct-q4.gguf",
        "size_gb": 4.9,
    },
}

# --- Global state ---

llm: Optional[Llama] = None
active_model_id: Optional[str] = None
_switch_lock = threading.Lock()

# Download/load progress tracking per model
# status: "idle" | "downloading" | "loading" | "ready" | "error"
_model_status: Dict[str, Dict[str, Any]] = {}

def _init_model_status():
    for mid in AVAILABLE_MODELS:
        _model_status[mid] = {
            "status": "idle",
            "download_progress": 0.0,     # 0-100
            "download_bytes": 0,
            "download_total_bytes": 0,
            "current_step": "",            # "downloading" | "loading" | ""
            "error": None,
        }

_init_model_status()


# --- Pydantic models ---

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    active_model: Optional[str] = None
    memory_usage: Dict[str, Any]

class ModelStatusInfo(BaseModel):
    id: str
    name: str
    size_gb: float
    downloaded: bool
    active: bool
    status: str              # idle | downloading | loading | ready | error
    download_progress: float # 0-100
    current_step: str
    error: Optional[str] = None

class ModelsStatusResponse(BaseModel):
    models: List[ModelStatusInfo]
    current_model: Optional[str] = None

class SwitchModelRequest(BaseModel):
    model_id: str

class SwitchModelResponse(BaseModel):
    ok: bool
    model: str
    status: str  # "downloading" | "loading" | "ready"

class DeleteModelRequest(BaseModel):
    model_id: str

class DeleteModelResponse(BaseModel):
    ok: bool
    model_id: str
    message: str

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    embedding: List[float]
    model: str
    dimensions: int

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 512

class ChatResponse(BaseModel):
    response: str
    generation_time_s: float

class CoverLetterRequest(BaseModel):
    company: str
    role: str
    job_description: str = ""
    location: str = ""
    candidate_name: str
    cover_letter_samples: List[str] = []
    resume_text: str = ""
    temperature: float = 0.7
    max_length: int = 1024

class CoverLetterResponse(BaseModel):
    cover_letter: str
    model_info: Dict[str, Any]
    usage: Dict[str, Any]
    generation_time_s: float


# --- Helpers ---

def get_memory_usage() -> Dict[str, Any]:
    try:
        process = psutil.Process()
        mem = process.memory_info()
        sys_mem = psutil.virtual_memory()
        return {
            "process_memory_mb": round(mem.rss / 1024 / 1024, 2),
            "process_memory_percent": round(process.memory_percent(), 2),
            "system_memory_total_gb": round(sys_mem.total / 1024**3, 2),
            "system_memory_available_gb": round(sys_mem.available / 1024**3, 2),
        }
    except Exception as e:
        logger.error(f"Error getting memory usage: {e}")
        return {"error": str(e)}


def model_path(model_id: str) -> Path:
    info = AVAILABLE_MODELS[model_id]
    return Path(MODEL_DIR) / info["local_name"]


def is_downloaded(model_id: str) -> bool:
    return model_path(model_id).exists()


def _monitor_download_progress(model_id: str, dest: Path, expected_size_bytes: int, stop_event: threading.Event):
    """Background thread to monitor file download progress by checking partial file sizes."""
    # HuggingFace downloads to a temp file first, then renames
    download_dir = dest.parent
    status = _model_status[model_id]

    while not stop_event.is_set():
        try:
            # Look for incomplete download files (HF uses .incomplete suffix or blobs dir)
            total_bytes = 0
            for f in download_dir.rglob("*"):
                if f.is_file() and (f.suffix == ".incomplete" or "blobs" in str(f)):
                    total_bytes = max(total_bytes, f.stat().st_size)

            # Also check the destination file directly
            if dest.exists():
                total_bytes = max(total_bytes, dest.stat().st_size)

            if expected_size_bytes > 0 and total_bytes > 0:
                progress = min(round((total_bytes / expected_size_bytes) * 100, 1), 99.9)
                status["download_progress"] = progress
                status["download_bytes"] = total_bytes
                status["download_total_bytes"] = expected_size_bytes
        except Exception:
            pass
        stop_event.wait(2)  # Check every 2 seconds


def download_model(model_id: str) -> None:
    """Download model with file-size-based progress tracking."""
    info = AVAILABLE_MODELS[model_id]
    dest = model_path(model_id)
    status = _model_status[model_id]

    if dest.exists():
        logger.info(f"Model {model_id} already downloaded at {dest}")
        status["status"] = "ready"
        status["download_progress"] = 100.0
        status["current_step"] = ""
        return

    logger.info(f"Downloading {info['name']} from {info['repo']}...")
    dest.parent.mkdir(parents=True, exist_ok=True)

    status["status"] = "downloading"
    status["download_progress"] = 0.0
    status["current_step"] = "downloading"
    status["error"] = None

    # Start a background thread to monitor download progress via file size
    expected_bytes = int(info["size_gb"] * 1024 * 1024 * 1024)
    stop_event = threading.Event()
    monitor = threading.Thread(
        target=_monitor_download_progress,
        args=(model_id, dest, expected_bytes, stop_event),
        daemon=True,
    )
    monitor.start()

    from huggingface_hub import hf_hub_download

    try:
        downloaded_path = hf_hub_download(
            repo_id=info["repo"],
            filename=info["filename"],
            local_dir=str(dest.parent),
            local_dir_use_symlinks=False,
        )
        # Rename to our standard local name
        dl = Path(downloaded_path)
        if dl != dest:
            dl.rename(dest)

        status["download_progress"] = 100.0
        status["current_step"] = ""
        logger.info(f"Model {model_id} downloaded to {dest}")
    finally:
        stop_event.set()
        monitor.join(timeout=5)


def load_model(model_id: str) -> None:
    global llm, active_model_id

    status = _model_status[model_id]
    status["status"] = "loading"
    status["current_step"] = "loading"

    # Unload current model if any
    if active_model_id and active_model_id != model_id:
        old_status = _model_status[active_model_id]
        old_status["status"] = "ready" if is_downloaded(active_model_id) else "idle"
    unload_model()

    path = model_path(model_id)
    if not path.exists():
        status["status"] = "error"
        status["error"] = f"Model file not found: {path}"
        raise FileNotFoundError(f"Model file not found: {path}")

    logger.info(f"Loading model {model_id} from {path}...")
    logger.info(f"Config: n_ctx={N_CTX}, n_threads={N_THREADS}, n_gpu_layers={N_GPU_LAYERS}")

    try:
        llm = Llama(
            model_path=str(path),
            n_ctx=N_CTX,
            n_threads=N_THREADS,
            n_gpu_layers=N_GPU_LAYERS,
            verbose=True,
            use_mmap=True,
            use_mlock=False,
            n_batch=256,
            f16_kv=True,
        )
        active_model_id = model_id
        status["status"] = "ready"
        status["current_step"] = ""
        status["download_progress"] = 100.0

        logger.info(f"Model {model_id} loaded successfully")
        logger.info(f"Memory after loading: {get_memory_usage()}")
    except Exception as e:
        status["status"] = "error"
        status["error"] = str(e)
        raise


def unload_model() -> None:
    global llm, active_model_id
    if llm is not None:
        del llm
        llm = None
        active_model_id = None
        gc.collect()
        logger.info("Model unloaded")


def _switch_model_background(model_id: str) -> None:
    """Download and load a model in a background thread."""
    try:
        download_model(model_id)
        load_model(model_id)
    except Exception as e:
        logger.error(f"Background model switch failed: {e}")
        _model_status[model_id]["status"] = "error"
        _model_status[model_id]["error"] = str(e)


def build_cover_letter_prompt(req: CoverLetterRequest) -> str:
    """Build a Llama 3.2 chat-formatted prompt for cover letter generation."""

    # System message
    system_parts = [
        "You are an expert cover letter writer. Write professional, compelling cover letters.",
    ]

    if req.cover_letter_samples:
        system_parts.append(
            "Match the tone, style, and structure of the following sample cover letter(s) "
            "provided by the candidate:"
        )
        for i, sample in enumerate(req.cover_letter_samples[:2]):  # max 2 samples
            truncated = sample[:2000]  # truncate long samples
            system_parts.append(f"\n--- Sample {i + 1} ---\n{truncated}")

    if req.resume_text:
        truncated_resume = req.resume_text[:1500]
        system_parts.append(f"\n--- Candidate Resume ---\n{truncated_resume}")

    system_msg = "\n".join(system_parts)

    # User message
    user_parts = [
        f"Write a cover letter for {req.candidate_name} applying to the {req.role} position at {req.company}.",
    ]
    if req.location:
        user_parts.append(f"The job is located in {req.location}.")
    if req.job_description:
        truncated_jd = req.job_description[:2000]
        user_parts.append(f"\nJob Description:\n{truncated_jd}")

    user_parts.append(
        "\nWrite only the cover letter text. Do not include any commentary or explanation."
    )
    user_msg = " ".join(user_parts) if not req.job_description else "\n".join(user_parts)

    # Llama 3.2 chat template
    prompt = (
        f"<|begin_of_text|>"
        f"<|start_header_id|>system<|end_header_id|>\n\n{system_msg}<|eot_id|>"
        f"<|start_header_id|>user<|end_header_id|>\n\n{user_msg}<|eot_id|>"
        f"<|start_header_id|>assistant<|end_header_id|>\n\n"
    )
    return prompt


# --- App lifecycle ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting LLM service...")
    Path(MODEL_DIR).mkdir(parents=True, exist_ok=True)

    # Load embedding model in background so it doesn't block startup
    threading.Thread(target=embed_module.init, daemon=True).start()

    # Mark already-downloaded models
    for mid in AVAILABLE_MODELS:
        if is_downloaded(mid):
            _model_status[mid]["status"] = "ready"
            _model_status[mid]["download_progress"] = 100.0

    if DEFAULT_MODEL:
        try:
            download_model(DEFAULT_MODEL)
            load_model(DEFAULT_MODEL)
        except Exception as e:
            logger.error(f"Failed to load default model: {e}")
    else:
        logger.info("No default model set. Waiting for user to select a model via POST /switch-model.")

    yield

    logger.info("Shutting down LLM service...")
    unload_model()


# --- FastAPI app ---

app = FastAPI(
    title="Job App Bot LLM Service",
    description="Local LLM service for cover letter generation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Endpoints ---

@app.get("/health", response_model=HealthResponse)
async def health_check():
    model_loaded = llm is not None
    return HealthResponse(
        status="healthy" if model_loaded else "no_model",
        model_loaded=model_loaded,
        active_model=AVAILABLE_MODELS[active_model_id]["name"] if active_model_id else None,
        memory_usage=get_memory_usage(),
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed_text(req: EmbedRequest):
    """Generate a 384-dim embedding for the given text using all-MiniLM-L6-v2."""
    if not embed_module.is_loaded():
        raise HTTPException(status_code=503, detail="Embedding model not yet loaded")
    try:
        vector = embed_module.embed_text(req.text)
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")
    return EmbedResponse(
        embedding=vector,
        model=embed_module.MODEL_NAME,
        dimensions=embed_module.DIMENSIONS,
    )


@app.get("/models", response_model=ModelsStatusResponse)
@app.get("/models/status", response_model=ModelsStatusResponse)
async def list_models():
    """List all models with download/load status. Poll this endpoint for progress updates."""
    models = []
    for mid, info in AVAILABLE_MODELS.items():
        st = _model_status[mid]
        models.append(ModelStatusInfo(
            id=mid,
            name=info["name"],
            size_gb=info["size_gb"],
            downloaded=is_downloaded(mid),
            active=(mid == active_model_id),
            status=st["status"],
            download_progress=st["download_progress"],
            current_step=st["current_step"],
            error=st.get("error"),
        ))
    return ModelsStatusResponse(
        models=models,
        current_model=active_model_id,
    )


@app.get("/model-info")
async def get_model_info():
    if llm is None or active_model_id is None:
        raise HTTPException(status_code=503, detail="No model loaded")

    info = AVAILABLE_MODELS[active_model_id]
    return {
        "model_id": active_model_id,
        "model_name": info["name"],
        "context_window": N_CTX,
        "threads": N_THREADS,
        "gpu_layers": N_GPU_LAYERS,
        "memory_usage": get_memory_usage(),
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if llm is None:
        raise HTTPException(status_code=503, detail="No model loaded. Use POST /switch-model to load one.")

    system_msg = "You are a helpful assistant."
    if req.context:
        logger.info(f"Chat with context: {len(req.context)} chars")
        system_msg += f"\n\nUse the following document context to answer the user's question:\n\n{req.context}"
    else:
        logger.info("Chat without context")

    prompt = (
        f"<|start_header_id|>system<|end_header_id|>\n\n{system_msg}<|eot_id|>"
        f"<|start_header_id|>user<|end_header_id|>\n\n{req.message}<|eot_id|>"
        f"<|start_header_id|>assistant<|end_header_id|>\n\n"
    )

    logger.info(f"Prompt length: {len(prompt)} chars")

    start = time.time()
    try:
        output = llm(
            prompt,
            max_tokens=min(req.max_tokens, 1024),
            temperature=req.temperature,
            top_p=0.9,
            stop=["<|eot_id|>", "<|start_header_id|>", "<|end_of_text|>"],
            echo=False,
        )
    except Exception as e:
        logger.error(f"Chat generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    text = output["choices"][0]["text"].strip()
    for token in ["<|eot_id|>", "<|start_header_id|>", "<|end_of_text|>"]:
        text = text.replace(token, "")
    text = text.strip()

    if not text:
        raise HTTPException(status_code=500, detail="Model produced empty output")

    return ChatResponse(response=text, generation_time_s=round(time.time() - start, 2))


@app.post("/switch-model", response_model=SwitchModelResponse)
async def switch_model(req: SwitchModelRequest):
    """Switch to a different model. Downloads if needed. Runs in background so client can poll /models/status."""
    if req.model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model_id}. Available: {list(AVAILABLE_MODELS.keys())}")

    if req.model_id == active_model_id:
        return SwitchModelResponse(ok=True, model=AVAILABLE_MODELS[req.model_id]["name"], status="ready")

    # Check if already downloading/loading
    st = _model_status[req.model_id]
    if st["status"] in ("downloading", "loading"):
        return SwitchModelResponse(ok=True, model=AVAILABLE_MODELS[req.model_id]["name"], status=st["status"])

    if not _switch_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another model switch is in progress")

    # If already downloaded, load synchronously (fast)
    if is_downloaded(req.model_id):
        try:
            load_model(req.model_id)
            return SwitchModelResponse(ok=True, model=AVAILABLE_MODELS[req.model_id]["name"], status="ready")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            _switch_lock.release()
    else:
        # Need to download — run in background thread so client can poll progress
        def run():
            try:
                _switch_model_background(req.model_id)
            finally:
                _switch_lock.release()

        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        return SwitchModelResponse(ok=True, model=AVAILABLE_MODELS[req.model_id]["name"], status="downloading")


@app.post("/generate-cover-letter", response_model=CoverLetterResponse)
async def generate_cover_letter(req: CoverLetterRequest):
    if llm is None:
        raise HTTPException(status_code=503, detail="No model loaded. Use POST /switch-model to load one.")

    prompt = build_cover_letter_prompt(req)
    logger.info(f"Generating cover letter for {req.candidate_name} at {req.company} ({req.role})")

    start = time.time()
    try:
        output = llm(
            prompt,
            max_tokens=min(req.max_length, 2048),
            temperature=req.temperature,
            top_p=0.9,
            stop=["<|eot_id|>", "<|start_header_id|>", "<|end_of_text|>"],
            echo=False,
        )
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    generation_time = time.time() - start

    text = output["choices"][0]["text"].strip()
    # Clean any leaked special tokens
    for token in ["<|eot_id|>", "<|start_header_id|>", "<|end_of_text|>"]:
        text = text.replace(token, "")
    text = text.strip()

    if not text:
        raise HTTPException(status_code=500, detail="Model produced empty output")

    usage = output.get("usage", {})
    logger.info(f"Cover letter generated in {generation_time:.2f}s ({usage.get('total_tokens', 0)} tokens)")

    return CoverLetterResponse(
        cover_letter=text,
        model_info={
            "model_id": active_model_id,
            "model_name": AVAILABLE_MODELS[active_model_id]["name"],
            "context_window": N_CTX,
            "temperature": req.temperature,
        },
        usage={
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        },
        generation_time_s=round(generation_time, 2),
    )


@app.post("/delete-model", response_model=DeleteModelResponse)
async def delete_model(req: DeleteModelRequest):
    """Delete a downloaded model file. Unloads it first if it's the active model."""
    if req.model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model_id}")

    st = _model_status[req.model_id]
    if st["status"] in ("downloading", "loading"):
        raise HTTPException(status_code=409, detail="Cannot delete while model is downloading or loading")

    path = model_path(req.model_id)

    # Unload if this is the active model
    if req.model_id == active_model_id:
        unload_model()

    # Delete the file
    if path.exists():
        path.unlink()
        logger.info(f"Deleted model file: {path}")

    # Reset status
    st["status"] = "idle"
    st["download_progress"] = 0.0
    st["current_step"] = ""
    st["error"] = None

    return DeleteModelResponse(
        ok=True,
        model_id=req.model_id,
        message=f"Model {AVAILABLE_MODELS[req.model_id]['name']} deleted",
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8083))
    logger.info(f"Starting LLM service on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, log_level="info")
