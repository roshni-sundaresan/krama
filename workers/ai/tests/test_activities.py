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


def test_draft_activity_marks_uncited_statements_ai_drafted(activities):
    reqs = env.run(activities.extract_requirements, {"sources": SOURCES})["requirements"]
    reqs[0]["citations"] = [{"sourceItemId": "unknown", "quote": "x"}]
    out = env.run(
        activities.draft_brd,
        {"project": {"name": "Demo"}, "version": 1, "requirements": reqs, "findings": [], "sources": SOURCES},
    )
    statements = [s for sec in out["document"]["sections"] for s in sec["statements"]]
    first = next(s for s in statements if reqs[0]["code"] in s["requirementCodes"])
    assert first["citations"] == [] and first["aiSuggested"] is True


def test_output_scrub_removes_personal_data():
    from krama_ai.activities import scrub

    assert "[REMOVED]" in scrub("Call 98765 43210 or a.b@c.com, PAN ABCDE1234F")
    assert "98765" not in scrub("Call 98765 43210")


def test_deep_audit_activity_uses_opus_and_validates(activities):
    out = env.run(
        activities.deep_audit,
        {"project": {"code": "X"}, "requirements": [], "findings": [], "document": {"sections": []}},
    )
    assert out["usage"][0]["tier"] == "opus"
    assert out["report"]["readiness_assessment"]["status"] == "READY_FOR_FSD"


def test_gateway_tier_override_and_cost(gateway):
    assert gateway.resolve_tier("deep_audit") == "opus"
    assert gateway.resolve_tier("lens_findings", "haiku") == "haiku"
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
    data, usage = gw.complete("extract_requirements", "sys", "prompt", {}, tier="haiku")
    assert data == {"gaps": []}
    assert fake.calls[0]["modelId"] == settings.model_ids["haiku"]
    assert json.loads(fake.calls[0]["body"])["anthropic_version"] == "bedrock-2023-05-31"
    assert usage.inputTokens == 10 and usage.provider == "bedrock"
    assert settings.aws_region == "ap-south-1"


def test_parse_json_object_errors():
    with pytest.raises(ValueError):
        parse_json_object("no json here")
