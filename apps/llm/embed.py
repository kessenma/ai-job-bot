"""
Lightweight embedding module using sentence-transformers all-MiniLM-L6-v2.
Loaded once at service startup; independent of the main LLM models.
"""

import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)

MODEL_NAME = "all-MiniLM-L6-v2"
DIMENSIONS = 384

_model = None
_model_lock = threading.Lock()
_load_error: Optional[str] = None


def init() -> None:
    """Load the embedding model. Called from lifespan on startup."""
    global _model, _load_error
    with _model_lock:
        if _model is not None:
            return
        try:
            logger.info(f"Loading embedding model: {MODEL_NAME}")
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(MODEL_NAME)
            _load_error = None
            logger.info(f"Embedding model loaded ({DIMENSIONS} dimensions)")
        except Exception as e:
            _load_error = str(e)
            logger.error(f"Failed to load embedding model: {e}")


def is_loaded() -> bool:
    return _model is not None


def embed_text(text: str) -> list[float]:
    """Encode text into a 384-dimensional vector. Raises RuntimeError if model not loaded."""
    if _model is None:
        raise RuntimeError(f"Embedding model not loaded. Error: {_load_error}")
    with _model_lock:
        vector = _model.encode(text, normalize_embeddings=True)
    return vector.tolist()
