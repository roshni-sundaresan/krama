"""Deterministic stub provider.

Used by default until Bedrock credentials are available. It produces plausible,
fully cited outputs from the structured payload with simple heuristics, so the
whole Phase 1 path (extract -> gaps -> draft -> approve) can be exercised and tested.
Same input -> same output, always.
"""

from __future__ import annotations

import json
import re
from typing import Any

from krama_ai.gateway import ModelRequest, ModelResponse

REQUIREMENT_CUE = re.compile(
    r"\b(must|shall|should|needs? to|required?|requires|has to|have to|want(?:s)? to|will need)\b", re.I
)
NFR_CUE = re.compile(
    r"\b(performance|secure|security|availability|uptime|response time|latency|scal\w*|audit\w*|"
    r"backup|compliance|encrypt\w*|privacy|accessib\w*)\b",
    re.I,
)
CONSTRAINT_CUE = re.compile(r"\b(only|within|budget|deadline|must not|cannot|on-prem\w*|region)\b", re.I)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
# iDhi transcript lines look like "[00:01:10] Speaker: text".
TRANSCRIPT_PREFIX = re.compile(r"^\[(\d{1,2}:\d{2}:\d{2})\]\s*([^:]{1,60}):\s*")

GAP_CATEGORIES: list[tuple[str, re.Pattern[str], str]] = [
    ("security", re.compile(r"\b(secur\w*|auth\w*|encrypt\w*|sso|log ?in|role|permission)\b", re.I), "HIGH"),
    ("performance", re.compile(r"\b(performance|latency|response time|throughput|concurren\w*)\b", re.I), "MEDIUM"),
    ("availability", re.compile(r"\b(availability|uptime|disaster|backup|recovery)\b", re.I), "MEDIUM"),
    ("data-retention", re.compile(r"\b(retention|retain|archiv\w*|delete|privacy|gdpr|dpdp)\b", re.I), "MEDIUM"),
    ("accessibility", re.compile(r"\b(accessib\w*|wcag|screen reader)\b", re.I), "LOW"),
    ("integration", re.compile(r"\b(integrat\w*|api|import|export|sync)\b", re.I), "LOW"),
]
VAGUE_TERMS = re.compile(
    r"\b(fast|quick(?:ly)?|user[- ]friendly|easy|simple|etc\.?|as needed|appropriate|robust)\b", re.I
)


def _tokens(obj: Any) -> int:
    return max(1, len(json.dumps(obj, sort_keys=True)) // 4)


def _title(sentence: str, words: int = 9) -> str:
    parts = re.sub(r"\s+", " ", sentence).strip().rstrip(".").split(" ")
    return " ".join(parts[:words]) + ("…" if len(parts) > words else "")


def extract_requirements(payload: dict[str, Any]) -> dict[str, Any]:
    requirements: list[dict[str, Any]] = []
    for source in payload.get("sources", []):
        for line_no, raw_line in enumerate(str(source.get("text", "")).splitlines(), start=1):
            line = raw_line.strip()
            location = f"line {line_no}"
            prefix = TRANSCRIPT_PREFIX.match(line)
            if prefix:
                location = f"{prefix.group(1)} ({prefix.group(2).strip()})"
                line = line[prefix.end() :]
            for sentence in SENTENCE_SPLIT.split(line):
                sentence = sentence.strip(" -*\t")
                if len(sentence) < 12 or not REQUIREMENT_CUE.search(sentence):
                    continue
                cue = REQUIREMENT_CUE.search(sentence).group(1).lower()  # type: ignore[union-attr]
                priority = (
                    "MUST"
                    if cue in {"must", "shall", "required", "require", "requires"}
                    else ("SHOULD" if cue == "should" else "COULD")
                )
                kind = (
                    "NON_FUNCTIONAL"
                    if NFR_CUE.search(sentence)
                    else "CONSTRAINT"
                    if CONSTRAINT_CUE.search(sentence)
                    else "FUNCTIONAL"
                )
                requirements.append(
                    {
                        "code": f"REQ-{len(requirements) + 1:03d}",
                        "title": _title(sentence),
                        "description": sentence,
                        "type": kind,
                        "priority": priority,
                        "citations": [{"sourceItemId": source["id"], "quote": sentence, "location": location}],
                    }
                )
    return {"requirements": requirements}


def gap_report(payload: dict[str, Any]) -> dict[str, Any]:
    reqs: list[dict[str, Any]] = payload.get("requirements", [])
    corpus = " ".join(r.get("description", "") for r in reqs)
    gaps: list[dict[str, Any]] = []
    if not reqs:
        gaps.append(
            {
                "category": "coverage",
                "description": "No requirement statements were found in the sources.",
                "severity": "HIGH",
                "relatedRequirementCodes": [],
            }
        )
    for category, pattern, severity in GAP_CATEGORIES:
        if not pattern.search(corpus):
            gaps.append(
                {
                    "category": category,
                    "description": f"No {category.replace('-', ' ')} requirements were captured.",
                    "severity": severity,
                    "relatedRequirementCodes": [],
                }
            )
    for r in reqs:
        m = VAGUE_TERMS.search(r.get("description", ""))
        if m:
            gaps.append(
                {
                    "category": "ambiguity",
                    "description": (
                        f'{r["code"]} uses vague wording ("{m.group(0)}"); add measurable acceptance criteria.'
                    ),
                    "severity": "MEDIUM",
                    "relatedRequirementCodes": [r["code"]],
                }
            )
    return {"gaps": gaps}


def _cited(req: dict[str, Any], text: str) -> dict[str, Any]:
    return {
        "text": text,
        "citations": req.get("citations", []),
        "requirementCodes": [req["code"]],
        "aiSuggested": False,
    }


def _suggested(text: str) -> dict[str, Any]:
    return {"text": text, "citations": [], "requirementCodes": [], "aiSuggested": True}


def draft_document(payload: dict[str, Any]) -> dict[str, Any]:
    doc_type = payload["documentType"]
    project = payload.get("projectName", "the project")
    reqs: list[dict[str, Any]] = payload.get("requirements", [])
    functional = [r for r in reqs if r.get("type") == "FUNCTIONAL"]
    nfr = [r for r in reqs if r.get("type") != "FUNCTIONAL"]

    if doc_type == "BRD":
        sections = [
            {
                "heading": "Purpose",
                "statements": [_suggested(f"This document captures the business needs for {project}.")],
            },
            {
                "heading": "Business requirements",
                "statements": [
                    _cited(r, f"{r['code']}: {r['description']}") for r in reqs if r.get("priority") != "COULD"
                ],
            },
            {
                "heading": "Nice to have",
                "statements": [
                    _cited(r, f"{r['code']}: {r['description']}") for r in reqs if r.get("priority") == "COULD"
                ],
            },
            {
                "heading": "Assumptions",
                "statements": [_suggested("Stakeholders named in the sources are available for review.")],
            },
        ]
    elif doc_type == "SOW":
        sections = [
            {
                "heading": "Scope of work",
                "statements": [_cited(r, f"Deliver {r['title']} ({r['code']}).") for r in reqs],
            },
            {
                "heading": "Deliverables",
                "statements": [
                    _suggested("Approved BRD and FSD, a guardrail-compliant code scaffold, and test suite.")
                ],
            },
            {
                "heading": "Out of scope",
                "statements": [_suggested("Anything not traceable to an approved requirement.")],
            },
        ]
    elif doc_type == "FSD":
        sections = [
            {"heading": "Functional specification", "statements": [_cited(r, r["description"]) for r in functional]},
            {
                "heading": "Non-functional requirements and constraints",
                "statements": [_cited(r, r["description"]) for r in nfr],
            },
            {
                "heading": "Open questions",
                "statements": [_suggested("Confirm error-handling and audit expectations per feature.")],
            },
        ]
    else:
        raise ValueError(f"unsupported document type {doc_type!r}")

    if payload.get("reviewerComments"):
        sections.append(
            {"heading": "Reviewer feedback addressed", "statements": [_suggested(str(payload["reviewerComments"]))]}
        )
    return {"document": {"title": f"{doc_type} — {project}", "sections": sections}}


HANDLERS = {
    "extract_requirements": extract_requirements,
    "gap_report": gap_report,
    "draft_document": draft_document,
}


class StubProvider:
    name = "stub"

    def generate(self, request: ModelRequest) -> ModelResponse:
        handler = HANDLERS.get(request.task)
        if handler is None:
            raise ValueError(f"stub provider has no handler for task {request.task!r}")
        data = handler(request.payload)
        return ModelResponse(
            data=data,
            provider=self.name,
            model_id=f"stub-{request.tier}",
            input_tokens=_tokens(request.payload) + len(request.system) // 4,
            output_tokens=_tokens(data),
        )
