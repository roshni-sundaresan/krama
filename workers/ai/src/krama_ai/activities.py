"""Temporal activities served on task queue "ai".

Names match packages/workflows/src/types.ts (AiActivities). Payloads are plain JSON dicts with camelCase
keys shared with the TypeScript side. Input text is already masked by the API (IN-G01).
Post-processing enforces Krama's invariants regardless of the model (BRD-DG-06):
  * a requirement without a valid citation is dropped,
  * a functional requirement without Given/When/Then keeps an empty list (flagged by BA-G05 at submission),
  * a document statement without citations is marked aiSuggested.
"""

from __future__ import annotations

import re
from typing import Any

from temporalio import activity

from krama_ai.gateway import ModelGateway
from krama_ai.prompts import SYSTEM, build_prompt

LENSES = {"L1", "L2", "L3", "L4", "L5", "L6"}
SEVERITIES = {"LOW", "MEDIUM", "HIGH"}
# Output scan (BRD-DG-07 / FSD DG-07): personal identifiers must never come back from the model.
PII = [
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"),
    re.compile(r"\b[6-9]\d{4}[\s-]?\d{5}\b"),
    re.compile(r"\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b"),
]


def scrub(text: str) -> str:
    for rx in PII:
        text = rx.sub("[REMOVED]", text)
    return text


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
            if not citations:
                activity.logger.warning("dropping uncited requirement %s", req.get("code"))
                continue
            requirements.append(
                {
                    **req,
                    "description": scrub(str(req.get("description", ""))),
                    "title": scrub(str(req.get("title", ""))),
                    "citations": citations,
                    "acceptanceCriteria": req.get("acceptanceCriteria") or [],
                }
            )
        return {"requirements": requirements, "usage": usage}

    @activity.defn(name="lensFindings")
    def lens_findings(self, payload: dict[str, Any]) -> dict[str, Any]:
        data, usage = self._call("lens_findings", payload)
        findings = []
        for f in data.get("findings", []):
            if f.get("lens") not in LENSES or f.get("severity") not in SEVERITIES:
                continue
            if not f.get("question") or not f.get("proposedDefault"):
                continue  # every finding must be a question with a default (L6)
            related = f.get("relatedRequirementCodes") or []
            findings.append({**f, "relatedRequirementCodes": related, "blocking": bool(f.get("blocking"))})
        return {"findings": findings, "usage": usage}

    @activity.defn(name="draftBrd")
    def draft_brd(self, payload: dict[str, Any]) -> dict[str, Any]:
        data, usage = self._call("draft_brd", payload)
        known = _source_ids(payload)
        document = data.get("document", {"title": "BRD", "sections": []})
        for section in document.get("sections", []):
            for st in section.get("statements", []):
                st["text"] = scrub(str(st.get("text", "")))
                st["citations"] = _valid_citations(st.get("citations", []), known)
                st.setdefault("requirementCodes", [])
                st["aiSuggested"] = not st["citations"] or bool(st.get("aiSuggested"))
        return {"document": document, "usage": usage}

    @activity.defn(name="deepAudit")
    def deep_audit(self, payload: dict[str, Any]) -> dict[str, Any]:
        data, usage = self._call("deep_audit", payload)
        report = data.get("report", data)
        ra = report.get("readiness_assessment") or {}
        if ra.get("status") not in {"READY_FOR_FSD", "NEEDS_CLARIFICATION", "BLOCKED_HIGH_RISK"}:
            raise ValueError("deep audit returned an invalid readiness status")
        # Rule 4 of the blueprint: a finding with no reference is discarded.
        report["adversarial_gap_matrix"] = [g for g in report.get("adversarial_gap_matrix", []) if g.get("brd_ref")]
        report.setdefault("sign_off_blocker_questions", [])
        return {"report": report, "usage": usage}

    def all(self) -> list[Any]:
        return [self.extract_requirements, self.lens_findings, self.draft_brd, self.deep_audit]
