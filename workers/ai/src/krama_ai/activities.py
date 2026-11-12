"""Temporal activities served on task queue "ai".

Names match packages/workflows/src/types.ts (AiActivities). Payloads are plain
JSON dicts with camelCase keys shared with the TypeScript side.
Activities are synchronous (model calls block) and run on the worker's thread pool.
Post-processing enforces Krama's citation invariants regardless of the model:
  * a requirement without a valid citation is dropped,
  * a document statement without citations is marked aiSuggested.
"""

from __future__ import annotations

from typing import Any

from temporalio import activity

from krama_ai.gateway import ModelGateway
from krama_ai.prompts import SYSTEM, build_prompt


def _source_ids(payload: dict[str, Any]) -> set[str]:
    return {str(s["id"]) for s in payload.get("sources", [])}


def _valid_citations(citations: list[dict[str, Any]], known: set[str]) -> list[dict[str, Any]]:
    return [c for c in citations if str(c.get("sourceItemId")) in known and c.get("quote")]


class AiActivities:
    def __init__(self, gateway: ModelGateway) -> None:
        self.gateway = gateway

    def _call(self, task: str, payload: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        if not isinstance(payload, dict):
            raise ValueError("activity input must be a JSON object")
        data, usage = self.gateway.complete(task, SYSTEM[task], build_prompt(task, payload), payload)
        return data, [usage.to_dict()]

    @activity.defn(name="extractRequirements")
    def extract_requirements(self, payload: dict[str, Any]) -> dict[str, Any]:
        data, usage = self._call("extract_requirements", payload)
        known = _source_ids(payload)
        requirements = []
        for req in data.get("requirements", []):
            citations = _valid_citations(req.get("citations", []), known)
            if citations:
                requirements.append({**req, "citations": citations})
            else:
                activity.logger.warning("dropping uncited requirement %s", req.get("code"))
        return {"requirements": requirements, "usage": usage}

    @activity.defn(name="gapReport")
    def gap_report(self, payload: dict[str, Any]) -> dict[str, Any]:
        data, usage = self._call("gap_report", payload)
        return {"gaps": data.get("gaps", []), "usage": usage}

    @activity.defn(name="draftDocument")
    def draft_document(self, payload: dict[str, Any]) -> dict[str, Any]:
        if payload.get("documentType") not in {"BRD", "SOW", "FSD"}:
            raise ValueError(f"unsupported documentType {payload.get('documentType')!r}")
        data, usage = self._call("draft_document", payload)
        known = _source_ids(payload)
        document = data.get("document", {"title": payload["documentType"], "sections": []})
        for section in document.get("sections", []):
            for st in section.get("statements", []):
                st["citations"] = _valid_citations(st.get("citations", []), known)
                st.setdefault("requirementCodes", [])
                if not st["citations"]:
                    st["aiSuggested"] = True
                else:
                    st.setdefault("aiSuggested", False)
        return {"document": document, "usage": usage}

    def all(self) -> list[Any]:
        return [self.extract_requirements, self.gap_report, self.draft_document]
