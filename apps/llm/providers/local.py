import logging
from typing import cast

from llama_cpp.llama_types import CreateCompletionResponse

import model_manager as mm
from config import AVAILABLE_MODELS, N_CTX
from prompts import build_chat_prompt, get_stop_tokens
from providers.base import LLMProvider, ProviderResponse

logger = logging.getLogger(__name__)


class LocalProvider(LLMProvider):
    provider_type = "local"

    def generate(self, system_msg: str, user_msg: str, max_tokens: int, temperature: float) -> ProviderResponse:
        if mm.llm is None or mm.active_model_id is None:
            raise RuntimeError("No local model loaded. Use POST /switch-model to load one.")

        stop_tokens = get_stop_tokens(mm.active_model_id)
        prompt = build_chat_prompt(system_msg, user_msg, mm.active_model_id)

        output = cast(CreateCompletionResponse, mm.llm(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=0.9,
            stop=stop_tokens,
            echo=False,
        ))

        text = output["choices"][0]["text"].strip()
        for token in stop_tokens:
            text = text.replace(token, "")
        text = text.strip()

        usage = output.get("usage", {})
        model_info = AVAILABLE_MODELS.get(mm.active_model_id, {})

        return ProviderResponse(
            text=text,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            model_id=mm.active_model_id,
            model_name=model_info.get("name", mm.active_model_id),
        )

    def is_available(self) -> bool:
        return mm.llm is not None
