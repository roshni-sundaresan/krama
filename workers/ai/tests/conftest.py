import pytest

from krama_ai.activities import AiActivities
from krama_ai.config import DEFAULT_PRICING
from krama_ai.gateway import ModelGateway, UsageRecord
from krama_ai.providers.stub import StubProvider

SOURCES = [
    {
        "id": "src-meeting-1",
        "title": "Kick-off meeting (iDhi)",
        "kind": "IDHI_MEETING",
        "text": (
            "Agents must be able to log in with company SSO.\n"
            "The dashboard should load fast for all users.\n"
            "We discussed the weather.\n"
            "Data must be stored only in the India region."
        ),
    },
    {
        "id": "src-doc-1",
        "title": "BA notes.md",
        "kind": "UPLOAD",
        "text": (
            "- Managers need to export monthly reports as CSV.\n- The system shall keep an audit trail of approvals."
        ),
    },
]


@pytest.fixture
def usage_log() -> list[UsageRecord]:
    return []


@pytest.fixture
def gateway(usage_log: list[UsageRecord]) -> ModelGateway:
    return ModelGateway(StubProvider(), DEFAULT_PRICING, hooks=[usage_log.append])


@pytest.fixture
def activities(gateway: ModelGateway) -> AiActivities:
    return AiActivities(gateway)
