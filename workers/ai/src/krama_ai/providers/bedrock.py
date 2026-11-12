"""Claude on Amazon Bedrock (ap-south-1) provider.

TODO (when Bedrock access is granted):
  * provide AWS credentials via the standard chain (IRSA / instance role preferred; never in code),
  * set BEDROCK_MODEL_HAIKU / _SONNET / _OPUS to the enabled model or inference-profile ids,
  * set MODEL_PROVIDER=bedrock.
"""

from __future__ import annotations

import json
import re
from typing import Any

from krama_ai.gateway import ModelRequest, ModelResponse, Tier

JSON_BLOCK = re.compile(r"\{.*\}", re.S)


class BedrockProvider:
    name = "bedrock"

    def __init__(
        self,
        region: str,
        model_ids: dict[Tier, str],
        max_output_tokens: int = 8000,
        client: Any | None = None,
    ) -> None:
        self.region = region
        self.model_ids = model_ids
        self.max_output_tokens = max_output_tokens
        if client is None:
            import boto3  # imported lazily so the stub path never needs AWS config

            client = boto3.client("bedrock-runtime", region_name=region)
        self.client = client

    def generate(self, request: ModelRequest) -> ModelResponse:
        model_id = self.model_ids[request.tier]
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self.max_output_tokens,
            "temperature": 0,
            "system": request.system,
            "messages": [{"role": "user", "content": [{"type": "text", "text": request.prompt}]}],
        }
        raw = self.client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )
        result = json.loads(raw["body"].read())
        text = "".join(part.get("text", "") for part in result.get("content", []) if part.get("type") == "text")
        usage = result.get("usage", {})
        return ModelResponse(
            data=parse_json_object(text),
            provider=self.name,
            model_id=model_id,
            input_tokens=int(usage.get("input_tokens", 0)),
            output_tokens=int(usage.get("output_tokens", 0)),
        )


def parse_json_object(text: str) -> dict[str, Any]:
    """Models are asked for bare JSON; tolerate code fences or surrounding prose."""
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        match = JSON_BLOCK.search(text)
        if not match:
            raise ValueError("model response did not contain a JSON object") from None
        value = json.loads(match.group(0))
    if not isinstance(value, dict):
        raise ValueError("model response JSON is not an object")
    return value
