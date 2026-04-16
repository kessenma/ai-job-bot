import json
import logging
import os
import re
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict

import embed as embed_module
import model_manager as mm
import psutil
from config import AVAILABLE_MODELS, DEFAULT_MODEL, MODEL_DIR, N_CTX
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from prompts import (
    build_answer_form_fields_messages,
    build_chat_prompt,
    build_cover_letter_messages,
    build_parse_resume_messages,
    build_resume_messages,
    build_score_job_messages,
)
from providers import get_provider, list_all_models
from schemas import (
    ChatRequest,
    ChatResponse,
    CoverLetterRequest,
    CoverLetterResponse,
    DeleteModelRequest,
    DeleteModelResponse,
    EmbedRequest,
    EmbedResponse,
    GenerateResumeRequest,
    GenerateResumeResponse,
    HealthResponse,
    ModelStatusInfo,
    ModelsStatusResponse,
    ParsedExperienceEntry,
    ParseResumeRequest,
    ParseResumeResponse,
    ScoreJobRequest,
    ScoreJobResponse,
    SwitchModelRequest,
    SwitchModelResponse,
    AnswerFormFieldsRequest,
    AnswerFormFieldsResponse,
    FormFieldAnswer,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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


def _is_cli_model(model_id: str | None) -> bool:
    """Check if the model_id refers to a CLI-based provider."""
    return bool(model_id and model_id.startswith("claude/"))


# --- App lifecycle ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting LLM service...")
    Path(MODEL_DIR).mkdir(parents=True, exist_ok=True)

    threading.Thread(target=embed_module.init, daemon=True).start()

    for mid in AVAILABLE_MODELS:
        if mm.is_downloaded(mid):
            mm._model_status[mid]["status"] = "ready"
            mm._model_status[mid]["download_progress"] = 100.0

    if DEFAULT_MODEL:
        try:
            mm.download_model(DEFAULT_MODEL)
            mm.load_model(DEFAULT_MODEL)
        except Exception as e:
            logger.error(f"Failed to load default model: {e}")
    else:
        logger.info("No default model set. Waiting for user to select a model via POST /switch-model.")

    yield

    logger.info("Shutting down LLM service...")
    mm.unload_model()


# --- FastAPI app ---

app = FastAPI(
    title="Job App Bot LLM Service",
    description="LLM service for cover letter generation — supports local models and CLI providers",
    version="2.0.0",
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
    model_loaded = mm.llm is not None
    return HealthResponse(
        status="healthy" if model_loaded else "no_model",
        model_loaded=model_loaded,
        active_model=AVAILABLE_MODELS[mm.active_model_id]["name"] if mm.active_model_id else None,
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
async def models_status(cli_path: str | None = None):
    """List all models (local + CLI) with status. Pass cli_path query param for CLI availability."""
    all_models = list_all_models(cli_path=cli_path)
    models = [ModelStatusInfo(**m) for m in all_models]
    return ModelsStatusResponse(models=models, current_model=mm.active_model_id)


@app.get("/model-info")
async def get_model_info():
    if mm.llm is None or mm.active_model_id is None:
        raise HTTPException(status_code=503, detail="No model loaded")
    info = AVAILABLE_MODELS[mm.active_model_id]
    return {
        "model_id": mm.active_model_id,
        "model_name": info["name"],
        "context_window": N_CTX,
        "threads": int(os.getenv("N_THREADS", "8")),
        "gpu_layers": int(os.getenv("N_GPU_LAYERS", "0")),
        "memory_usage": get_memory_usage(),
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    use_cli = _is_cli_model(req.model_id)

    if not use_cli and mm.llm is None:
        raise HTTPException(status_code=503, detail="No model loaded. Use POST /switch-model to load one.")

    system_msg = "You are a helpful assistant."
    if req.context:
        logger.info(f"Chat with context: {len(req.context)} chars")
        system_msg += f"\n\nUse the following document context to answer the user's question:\n\n{req.context}"
    else:
        logger.info("Chat without context")

    start = time.time()
    try:
        provider = get_provider(req.model_id, cli_path=req.cli_path)
        result = provider.generate(system_msg, req.message, max_tokens=min(req.max_tokens, 1024), temperature=req.temperature)
    except Exception as e:
        logger.error(f"Chat generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    if not result.text:
        raise HTTPException(status_code=500, detail="Model produced empty output")

    return ChatResponse(response=result.text, generation_time_s=round(time.time() - start, 2))


@app.post("/switch-model", response_model=SwitchModelResponse)
async def switch_model(req: SwitchModelRequest):
    """Switch to a different local model. Downloads if needed. Runs in background so client can poll /models/status."""
    if req.model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model_id}. Available: {list(AVAILABLE_MODELS.keys())}")

    if req.model_id == mm.active_model_id:
        return SwitchModelResponse(ok=True, model=AVAILABLE_MODELS[req.model_id]["name"], status="ready")

    st = mm._model_status[req.model_id]
    if st["status"] in ("downloading", "loading"):
        return SwitchModelResponse(ok=True, model=AVAILABLE_MODELS[req.model_id]["name"], status=st["status"])

    if not mm._switch_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another model switch is in progress")

    if mm.is_downloaded(req.model_id):
        try:
            mm.load_model(req.model_id)
            return SwitchModelResponse(ok=True, model=AVAILABLE_MODELS[req.model_id]["name"], status="ready")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            mm._switch_lock.release()
    else:
        def run():
            try:
                mm.switch_model_background(req.model_id)
            finally:
                mm._switch_lock.release()

        threading.Thread(target=run, daemon=True).start()
        return SwitchModelResponse(ok=True, model=AVAILABLE_MODELS[req.model_id]["name"], status="downloading")


@app.post("/score-job", response_model=ScoreJobResponse)
async def score_job(req: ScoreJobRequest):
    """Score how well a job matches the candidate's profile (1-10)."""
    use_cli = _is_cli_model(req.model_id)

    if not use_cli and mm.llm is None:
        raise HTTPException(status_code=503, detail="No model loaded. Use POST /switch-model to load one.")

    logger.info(f"Scoring job: {req.role} at {req.company} (model: {req.model_id or 'local'})")

    start = time.time()
    try:
        provider = get_provider(req.model_id, cli_path=req.cli_path)
        system_msg, user_msg = build_score_job_messages(req, full_context=use_cli)
        result = provider.generate(system_msg, user_msg, max_tokens=256, temperature=0.3)
    except Exception as e:
        logger.error(f"Scoring error: {e}")
        raise HTTPException(status_code=500, detail=f"Scoring failed: {e}")

    generation_time = time.time() - start
    text = result.text

    try:
        json_match = re.search(r'\{[^}]+\}', text)
        parsed = json.loads(json_match.group() if json_match else text)
        score = max(1, min(10, int(parsed.get("score", 5))))
        reason = str(parsed.get("reason", ""))
    except (json.JSONDecodeError, ValueError):
        numbers = re.findall(r'\b(\d+)\b', text)
        score = max(1, min(10, int(numbers[0]))) if numbers else 5
        reason = text[:200]

    logger.info(f"Job scored {score}/10 in {generation_time:.2f}s")
    return ScoreJobResponse(score=score, reason=reason, generation_time_s=round(generation_time, 2))


@app.post("/generate-cover-letter", response_model=CoverLetterResponse)
async def generate_cover_letter(req: CoverLetterRequest):
    use_cli = _is_cli_model(req.model_id)

    if not use_cli and mm.llm is None:
        raise HTTPException(status_code=503, detail="No model loaded. Use POST /switch-model to load one.")

    logger.info(f"Generating cover letter for {req.candidate_name} at {req.company} ({req.role}) [model: {req.model_id or 'local'}]")

    start = time.time()
    try:
        provider = get_provider(req.model_id, cli_path=req.cli_path)
        system_msg, user_msg = build_cover_letter_messages(req, full_context=use_cli)
        result = provider.generate(system_msg, user_msg, max_tokens=min(req.max_length, 2048), temperature=req.temperature)
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    generation_time = time.time() - start

    if not result.text:
        raise HTTPException(status_code=500, detail="Model produced empty output")

    logger.info(f"Cover letter generated in {generation_time:.2f}s ({result.input_tokens + result.output_tokens} tokens)")

    return CoverLetterResponse(
        cover_letter=result.text,
        model_info={
            "model_id": result.model_id,
            "model_name": result.model_name,
            "context_window": N_CTX if not use_cli else 200000,
            "temperature": req.temperature,
        },
        usage={
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "total_tokens": result.input_tokens + result.output_tokens,
        },
        generation_time_s=round(generation_time, 2),
    )


@app.post("/generate-resume", response_model=GenerateResumeResponse)
async def generate_resume(req: GenerateResumeRequest):
    """Generate a tailored resume from experience entries for a specific job."""
    use_cli = _is_cli_model(req.model_id)

    if not use_cli and mm.llm is None:
        raise HTTPException(status_code=503, detail="No model loaded. Use POST /switch-model to load one.")

    logger.info(f"Generating resume for {req.candidate_name} at {req.company} ({req.role}) [model: {req.model_id or 'local'}]")

    start = time.time()
    try:
        provider = get_provider(req.model_id, cli_path=req.cli_path)
        system_msg, user_msg = build_resume_messages(req, full_context=use_cli)
        result = provider.generate(system_msg, user_msg, max_tokens=min(req.max_length, 4096), temperature=req.temperature)
    except Exception as e:
        logger.error(f"Resume generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    generation_time = time.time() - start

    if not result.text:
        raise HTTPException(status_code=500, detail="Model produced empty output")

    logger.info(f"Resume generated in {generation_time:.2f}s ({result.input_tokens + result.output_tokens} tokens)")

    return GenerateResumeResponse(
        resume_text=result.text,
        model_info={
            "model_id": result.model_id,
            "model_name": result.model_name,
            "context_window": N_CTX if not use_cli else 200000,
            "temperature": req.temperature,
        },
        usage={
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "total_tokens": result.input_tokens + result.output_tokens,
        },
        generation_time_s=round(generation_time, 2),
    )


@app.post("/parse-resume", response_model=ParseResumeResponse)
async def parse_resume(req: ParseResumeRequest):
    """Extract structured experience entries from resume text using the LLM."""
    use_cli = _is_cli_model(req.model_id)

    if not use_cli and mm.llm is None:
        raise HTTPException(status_code=503, detail="No model loaded. Use POST /switch-model to load one.")

    if not req.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is empty")

    logger.info(f"Parsing resume text ({len(req.resume_text)} chars) [model: {req.model_id or 'local'}]")

    start = time.time()
    try:
        provider = get_provider(req.model_id, cli_path=req.cli_path)
        system_msg, user_msg = build_parse_resume_messages(req)
        result = provider.generate(system_msg, user_msg, max_tokens=min(req.max_tokens, 4096), temperature=req.temperature)
    except Exception as e:
        logger.error(f"Resume parse error: {e}")
        raise HTTPException(status_code=500, detail=f"Parsing failed: {e}")

    generation_time = time.time() - start
    text = result.text

    if not text:
        raise HTTPException(status_code=500, detail="Model produced empty output")

    try:
        json_match = re.search(r'\[[\s\S]*\]', text)
        raw = json.loads(json_match.group() if json_match else text)
        entries = [ParsedExperienceEntry(**item) for item in raw]
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        logger.error(f"Failed to parse LLM output as JSON: {text[:500]}")
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM output: {e}")

    logger.info(f"Parsed {len(entries)} experience entries in {generation_time:.2f}s")
    return ParseResumeResponse(entries=entries, generation_time_s=round(generation_time, 2))


@app.post("/answer-form-fields", response_model=AnswerFormFieldsResponse)
async def answer_form_fields(req: AnswerFormFieldsRequest):
    """Suggest answers for skipped form fields using candidate profile + experience."""
    use_cli = _is_cli_model(req.model_id)

    if not use_cli and mm.llm is None:
        raise HTTPException(status_code=503, detail="No model loaded. Use POST /switch-model to load one.")

    if not req.form_fields:
        raise HTTPException(status_code=400, detail="form_fields is empty")

    logger.info(f"Answering {len(req.form_fields)} form fields for {req.role} at {req.company} [model: {req.model_id or 'local'}]")

    start = time.time()
    try:
        provider = get_provider(req.model_id, cli_path=req.cli_path)
        system_msg, user_msg = build_answer_form_fields_messages(req, full_context=use_cli)
        result = provider.generate(system_msg, user_msg, max_tokens=min(req.max_tokens, 4096), temperature=req.temperature)
    except Exception as e:
        logger.error(f"Form field answering error: {e}")
        raise HTTPException(status_code=500, detail=f"Answering failed: {e}")

    generation_time = time.time() - start
    text = result.text

    if not text:
        raise HTTPException(status_code=500, detail="Model produced empty output")

    try:
        json_match = re.search(r'\[[\s\S]*\]', text)
        raw = json.loads(json_match.group() if json_match else text)
        answers = [FormFieldAnswer(**item) for item in raw]
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        logger.error(f"Failed to parse form field answers: {text[:500]}")
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM output: {e}")

    logger.info(f"Answered {len(answers)} fields in {generation_time:.2f}s")
    return AnswerFormFieldsResponse(answers=answers, generation_time_s=round(generation_time, 2))


@app.post("/delete-model", response_model=DeleteModelResponse)
async def delete_model(req: DeleteModelRequest):
    """Delete a downloaded model file. Unloads it first if it's the active model."""
    if req.model_id not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model_id}")

    st = mm._model_status[req.model_id]
    if st["status"] in ("downloading", "loading"):
        raise HTTPException(status_code=409, detail="Cannot delete while model is downloading or loading")

    path = mm.model_path(req.model_id)

    if req.model_id == mm.active_model_id:
        mm.unload_model()

    if path.exists():
        path.unlink()
        logger.info(f"Deleted model file: {path}")

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
