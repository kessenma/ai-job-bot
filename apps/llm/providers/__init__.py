from providers.base import LLMProvider, ProviderResponse
from providers.local import LocalProvider
from providers.claude_cli import ClaudeCliProvider
from config import AVAILABLE_MODELS, CLI_MODELS, CLAUDE_CLI_PATH
import model_manager as mm

__all__ = ["get_provider", "list_all_models", "LLMProvider", "ProviderResponse"]


def get_provider(model_id: str | None = None, cli_path: str | None = None) -> LLMProvider:
    """Resolve a model_id to the appropriate provider instance."""
    # No model specified → use active local model
    if not model_id:
        return LocalProvider()

    # Claude CLI models (prefixed with "claude/")
    if model_id.startswith("claude/"):
        claude_model = model_id.removeprefix("claude/")
        path = cli_path or CLAUDE_CLI_PATH
        if not path:
            raise ValueError("Claude CLI path not configured. Set CLAUDE_CLI_PATH or pass cli_path.")
        return ClaudeCliProvider(cli_path=path, model=claude_model)

    # Bare model IDs → local provider
    if model_id in AVAILABLE_MODELS:
        return LocalProvider()

    raise ValueError(f"Unknown model: {model_id}")


def list_all_models(cli_path: str | None = None) -> list[dict]:
    """List all available models across all providers."""
    models = []

    # Local models
    for mid, info in AVAILABLE_MODELS.items():
        st = mm._model_status.get(mid, {})
        models.append({
            "id": mid,
            "name": info["name"],
            "provider": "local",
            "size_gb": info["size_gb"],
            "context_window": 4096,
            "downloaded": mm.is_downloaded(mid),
            "active": mid == mm.active_model_id,
            "status": st.get("status", "idle"),
            "download_progress": st.get("download_progress", 0.0),
            "current_step": st.get("current_step", ""),
            "error": st.get("error"),
            "cli": False,
        })

    # Claude CLI models
    resolved_path = cli_path or CLAUDE_CLI_PATH
    for mid, info in CLI_MODELS.items():
        models.append({
            "id": mid,
            "name": info["name"],
            "provider": info["provider"],
            "size_gb": 0,
            "context_window": info["context_window"],
            "downloaded": True,  # CLI models don't need download
            "active": False,  # CLI models are stateless
            "status": "ready" if resolved_path else "unavailable",
            "download_progress": 100.0,
            "current_step": "",
            "error": None if resolved_path else "Claude CLI not configured",
            "cli": True,
        })

    return models
