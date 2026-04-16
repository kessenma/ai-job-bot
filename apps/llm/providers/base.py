from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ProviderResponse:
    text: str
    input_tokens: int
    output_tokens: int
    model_id: str
    model_name: str


class LLMProvider(ABC):
    provider_type: str  # "local" | "claude" | "copilot" | "codex"

    @abstractmethod
    def generate(self, system_msg: str, user_msg: str, max_tokens: int, temperature: float) -> ProviderResponse:
        ...

    @abstractmethod
    def is_available(self) -> bool:
        ...
