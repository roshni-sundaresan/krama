import io
import json

import pytest
from temporalio.testing import ActivityEnvironment

from krama_ai.config import DEFAULT_PRICING, Settings
from krama_ai.gateway import ModelGateway
from krama_ai.providers.bedrock import BedrockProvider, parse_json_object

from .conftest import SOURCES

env = ActivityEnvironment()


def test_extract_activity_returns_cited_requirements_and_usage(activities, usage_log):
    out = env.run(activities.extract_requirements, {"tenantId": "t", "projectId": "p", "sources": SOURCES})
    assert len(out["requirements"]) == 5
    assert out["usage"][0]["tier"] == "sonnet"
    assert out["usage"][0]["provider"] == "stub"
    assert out["usage"][0]["costUsd"] > 0
    assert len(usage_log) == 1


def test_gap_activity_uses_haiku_tier(activities):
    reqs = env.run(activities.extract_requirements, {"sources": SOURCES})["requirements"]
    out = env.run(activities.gap_report, {"sources": SOURCES, "requirements": reqs})
    assert out["usage"][0]["tier"] == "haiku"
    assert out["gaps"]


def test_draft_activity_enforces_citation_invariant(activities):
    reqs = env.run(activities.extract_requirements, {"sources": SOURCES})["requirements"]
    # a citation pointing at an unknown source is stripped and the statement becomes AI-suggested
    reqs[0]["citations"] = [{"sourceItemId": "unknown", "quote": "x"}]
    out = env.run(
        activities.draft_document,
        {"documentType": "FSD", "projectName": "Demo", "requirements": reqs, "sources": SOURCES},
    )
    statements = [s for sec in out["document"]["sections"] for s in sec["statements"]]
    first = next(s for s in statements if "REQ-001" in s["requirementCodes"])
    assert first["citations"] == [] and first["aiSuggested"] is True


def test_draft_activity_rejects_unknown_type(activities):
    with pytest.raises(ValueError):
        env.run(activities.draft_document, {"documentType": "PRD", "requirements": []})


def test_gateway_tier_override_and_cost(gateway):
    assert gateway.resolve_tier("gap_report") == "haiku"
    assert gateway.resolve_tier("gap_report", "opus") == "opus"
    assert gateway.resolve_tier("unknown_task") == "sonnet"
    assert gateway.cost("sonnet", 1_000_000, 0) == DEFAULT_PRICING["sonnet"][0]
    with pytest.raises(ValueError):
        gateway.resolve_tier("x", "gpt")  # type: ignore[arg-type]


class FakeBedrock:
    def __init__(self, text: str):
        self.text = text
        self.calls: list[dict] = []

    def invoke_model(self, **kwargs):
        self.calls.append(kwargs)
        body = {"content": [{"type": "text", "text": self.text}], "usage": {"input_tokens": 10, "output_tokens": 5}}
        return {"body": io.BytesIO(json.dumps(body).encode())}


def test_bedrock_provider_with_fake_client(usage_log):
    fake = FakeBedrock('```json\n{"gaps": []}\n```')
    settings = Settings()
    provider = BedrockProvider(settings.aws_region, settings.model_ids, client=fake)
    gw = ModelGateway(provider, DEFAULT_PRICING, hooks=[usage_log.append])
    data, usage = gw.complete("gap_report", "sys", "prompt", {})
    assert data == {"gaps": []}
    assert fake.calls[0]["modelId"] == settings.model_ids["haiku"]
    assert json.loads(fake.calls[0]["body"])["anthropic_version"] == "bedrock-2023-05-31"
    assert usage.inputTokens == 10 and usage.provider == "bedrock"
    assert settings.aws_region == "ap-south-1"


def test_parse_json_object_errors():
    with pytest.raises(ValueError):
        parse_json_object("no json here")
