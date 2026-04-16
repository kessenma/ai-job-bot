import json
import logging
import subprocess
from providers.base import LLMProvider, ProviderResponse

logger = logging.getLogger(__name__)


class ClaudeCliProvider(LLMProvider):
    """Spawns the Claude CLI to generate responses. No API key needed — uses CLI auth."""

    provider_type = "claude"

    def __init__(self, cli_path: str, model: str = "claude-sonnet-4-20250514"):
        self.cli_path = cli_path
        self.model = model

    def generate(self, system_msg: str, user_msg: str, max_tokens: int, temperature: float) -> ProviderResponse:
        # Combine system + user messages as the prompt sent via stdin
        prompt = f"{system_msg}\n\n{user_msg}"

        logger.info(f"Spawning Claude CLI: {self.cli_path} -p --output-format json --model {self.model}")
        logger.info(f"Prompt length: {len(prompt)} chars")

        try:
            result = subprocess.run(
                [self.cli_path, "-p", "--output-format", "json", "--model", self.model],
                input=prompt,
                capture_output=True,
                text=True,
                timeout=180,  # 3 min timeout for generation
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"Claude CLI timed out after 180s")
        except FileNotFoundError:
            raise RuntimeError(f"Claude CLI not found at: {self.cli_path}")

        if result.returncode != 0:
            stderr_tail = result.stderr[-500:] if result.stderr else "(no stderr)"
            stdout_tail = result.stdout[-500:] if result.stdout else "(no stdout)"
            raise RuntimeError(
                f"Claude CLI exited with code {result.returncode}.\n"
                f"stderr: {stderr_tail}\n"
                f"stdout: {stdout_tail}"
            )

        # Parse the JSON output
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            # Claude CLI may output NDJSON — try parsing last line
            lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
            if lines:
                try:
                    parsed = json.loads(lines[-1])
                except json.JSONDecodeError:
                    raise RuntimeError(f"Failed to parse Claude CLI output as JSON: {result.stdout[:500]}")
            else:
                raise RuntimeError(f"Empty output from Claude CLI")

        # Extract the response text
        # Claude CLI JSON format: {"type": "result", "result": "...", "cost_info": {...}}
        text = parsed.get("result", "")
        if not text:
            # Fallback: check for content in other possible fields
            text = parsed.get("content", parsed.get("text", ""))

        if not text:
            raise RuntimeError(f"No text in Claude CLI response: {json.dumps(parsed)[:500]}")

        # Extract token usage
        cost_info = parsed.get("cost_info", {}) or {}
        usage = parsed.get("usage", {}) or {}
        input_tokens = cost_info.get("input_tokens", usage.get("input_tokens", 0))
        output_tokens = cost_info.get("output_tokens", usage.get("output_tokens", 0))

        logger.info(f"Claude CLI response: {len(text)} chars, {input_tokens}+{output_tokens} tokens")

        return ProviderResponse(
            text=text.strip(),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model_id=f"claude/{self.model}",
            model_name=self.model,
        )

    def is_available(self) -> bool:
        try:
            result = subprocess.run(
                [self.cli_path, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
