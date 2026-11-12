"""Environment-driven settings for the AI worker."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from krama_ai.gateway import Tier

# TODO: confirm per-token prices for Claude on Bedrock in ap-south-1 (USD per 1M tokens: input, output).
DEFAULT_PRICING: dict[Tier, tuple[float, float]] = {
    "haiku": (1.0, 5.0),
    "sonnet": (3.0, 15.0),
    "opus": (5.0, 25.0),
}


@dataclass(frozen=True)
class Settings:
    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"
    task_queue: str = "ai"
    # "stub" (deterministic, default) or "bedrock".
    model_provider: str = "stub"
    aws_region: str = "ap-south-1"
    # TODO: set to the Bedrock model / inference-profile ids enabled for Idealake in ap-south-1.
    model_ids: dict[Tier, str] = field(
        default_factory=lambda: {
            "haiku": "apac.anthropic.claude-haiku-4-5-20251001-v1:0",
            "sonnet": "apac.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "opus": "apac.anthropic.claude-opus-4-5-20251101-v1:0",
        }
    )
    max_output_tokens: int = 8000

    @classmethod
    def from_env(cls) -> Settings:
        base = cls()
        return cls(
            temporal_address=os.getenv("TEMPORAL_ADDRESS", base.temporal_address),
            temporal_namespace=os.getenv("TEMPORAL_NAMESPACE", base.temporal_namespace),
            task_queue=os.getenv("AI_TASK_QUEUE", base.task_queue),
            model_provider=os.getenv("MODEL_PROVIDER", base.model_provider).lower(),
            aws_region=os.getenv("BEDROCK_REGION", os.getenv("AWS_REGION", base.aws_region)),
            model_ids={
                "haiku": os.getenv("BEDROCK_MODEL_HAIKU", base.model_ids["haiku"]),
                "sonnet": os.getenv("BEDROCK_MODEL_SONNET", base.model_ids["sonnet"]),
                "opus": os.getenv("BEDROCK_MODEL_OPUS", base.model_ids["opus"]),
            },
            max_output_tokens=int(os.getenv("BEDROCK_MAX_OUTPUT_TOKENS", str(base.max_output_tokens))),
        )
