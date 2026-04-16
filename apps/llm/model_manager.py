import gc
import logging
import threading
from pathlib import Path
from typing import Any, Dict, Optional

from config import AVAILABLE_MODELS, MODEL_DIR, N_CTX, N_GPU_LAYERS, N_THREADS

logger = logging.getLogger(__name__)

# --- Global state ---

llm = None
active_model_id: Optional[str] = None
_switch_lock = threading.Lock()

# Download/load progress tracking per model
# status: "idle" | "downloading" | "loading" | "ready" | "error"
_model_status: Dict[str, Dict[str, Any]] = {}


def _init_model_status() -> None:
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


def model_path(model_id: str) -> Path:
    info = AVAILABLE_MODELS[model_id]
    return Path(MODEL_DIR) / info["local_name"]


def is_downloaded(model_id: str) -> bool:
    return model_path(model_id).exists()


def _monitor_download_progress(model_id: str, dest: Path, expected_size_bytes: int, stop_event: threading.Event) -> None:
    """Background thread to monitor file download progress by checking partial file sizes."""
    download_dir = dest.parent
    status = _model_status[model_id]

    while not stop_event.is_set():
        try:
            total_bytes = 0
            for f in download_dir.rglob("*"):
                if f.is_file() and (f.suffix == ".incomplete" or "blobs" in str(f)):
                    total_bytes = max(total_bytes, f.stat().st_size)

            if dest.exists():
                total_bytes = max(total_bytes, dest.stat().st_size)

            if expected_size_bytes > 0 and total_bytes > 0:
                progress = min(round((total_bytes / expected_size_bytes) * 100, 1), 99.9)
                status["download_progress"] = progress
                status["download_bytes"] = total_bytes
                status["download_total_bytes"] = expected_size_bytes
        except Exception:
            pass
        stop_event.wait(2)


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
        )
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

    from llama_cpp import Llama

    status = _model_status[model_id]
    status["status"] = "loading"
    status["current_step"] = "loading"

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


def switch_model_background(model_id: str) -> None:
    """Download and load a model in a background thread."""
    try:
        download_model(model_id)
        load_model(model_id)
    except Exception as e:
        logger.error(f"Background model switch failed: {e}")
        _model_status[model_id]["status"] = "error"
        _model_status[model_id]["error"] = str(e)
