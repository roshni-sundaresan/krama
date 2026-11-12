"""Model gateway: one entry point for every model call.

Responsibilities: pick a tier (haiku = simple, sonnet = default, opus = hard),
delegate to the configured provider, compute cost and emit token-usage records
to registered hooks. Activities never talk to a provider directly.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Protocol

Tier = Literal["haiku", "sonnet", "opus"]
TIERS: tuple[Tier, ...] = ("haiku", "sonnet", "opus")

# Default tier per task. Override per call with `tier=`.
TASK_TIERS: dict[str, Tier] = {
    "extract_requirements": "sonnet",
    "gap_report": "haiku",
    "draft_document": "sonnet",
}

log = logging.getLogger("krama_ai.usage")


@dataclass(frozen=True)
class ModelRequest:
    task: str
    tier: Tier
    system: str
    prompt: str
    # Structured input; the stub provider works from this, real providers from system/prompt.
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModelResponse:
    data: dict[str, Any]
    provider: str
    model_id: str
    input_tokens: int
    output_tokens: int


@dataclass(frozen=True)
class UsageRecord:
    provider: str
    modelId: str  # noqa: N815 - JSON field names shared with the TS side
    tier: Tier
    task: str
    inputTokens: int  # noqa: N815
    outputTokens: int  # noqa: N815
    costUsd: float  # noqa: N815

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ModelProvider(Protocol):
    name: str

    def generate(self, request: ModelRequest) -> ModelResponse: ...


UsageHook = Callable[[UsageRecord], None]


def logging_usage_hook(record: UsageRecord) -> None:
    """Default hook: structured log line. TODO: also push to a metrics backend."""
    log.info("token_usage %s", json.dumps(record.to_dict()))


class ModelGateway:
    def __init__(
        self,
        provider: ModelProvider,
        pricing: dict[Tier, tuple[float, float]],
        hooks: list[UsageHook] | None = None,
    ) -> None:
        self.provider = provider
        self.pricing = pricing
        self.hooks: list[UsageHook] = hooks if hooks is not None else [logging_usage_hook]

    def resolve_tier(self, task: str, tier: Tier | None = None) -> Tier:
        if tier is not None:
            if tier not in TIERS:
                raise ValueError(f"unknown tier {tier!r}")
            return tier
        return TASK_TIERS.get(task, "sonnet")

    def cost(self, tier: Tier, input_tokens: int, output_tokens: int) -> float:
        in_price, out_price = self.pricing[tier]
        return round((input_tokens * in_price + output_tokens * out_price) / 1_000_000, 6)

    def complete(
        self,
        task: str,
        system: str,
        prompt: str,
        payload: dict[str, Any],
        tier: Tier | None = None,
    ) -> tuple[dict[str, Any], UsageRecord]:
        resolved = self.resolve_tier(task, tier)
        response = self.provider.generate(
            ModelRequest(task=task, tier=resolved, system=system, prompt=prompt, payload=payload)
        )
        record = UsageRecord(
            provider=response.provider,
            modelId=response.model_id,
            tier=resolved,
            task=task,
            inputTokens=response.input_tokens,
            outputTokens=response.output_tokens,
            costUsd=self.cost(resolved, response.input_tokens, response.output_tokens),
        )
        for hook in self.hooks:
            try:
                hook(record)
            except Exception:  # a broken hook must never fail the model call
                log.exception("usage hook failed")
        return response.data, record
