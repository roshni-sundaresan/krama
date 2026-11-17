"""Deterministic stub provider.

Used until Bedrock credentials are available. It produces plausible, fully cited output from the
structured payload with simple heuristics, so the whole BA path (extract -> lenses -> BRD -> Deep Audit)
can be exercised and tested. Same input -> same output, always.
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
    r"\b(performance|secure|security|availability|uptime|response time|latency|seconds?|scal\w*|audit\w*|"
    r"backup|compliance|encrypt\w*|privacy|accessib\w*|wcag|retain|retention|vapt|mfa)\b",
    re.I,
)
CONSTRAINT_CUE = re.compile(r"\b(only|within|budget|deadline|must not|cannot|on-prem\w*|region|in india)\b", re.I)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
TRANSCRIPT_PREFIX = re.compile(r"^\[(\d{1,2}:\d{2}:\d{2})\]\s*([^:]{1,60}):\s*")
ACTOR_CUE = re.compile(
    r"\b(customer|applicant|borrower|investor|branch|officer|manager|admin\w*|agent|ops|operations|user|"
    r"underwriter|approver|maker|checker|employee|dealer)s?\b",
    re.I,
)
VAGUE = re.compile(
    r"\b(fast|quick(?:ly)?|user[- ]friendly|easy|simple|seamless(?:ly)?|real[- ]time|robust|intelligent|"
    r"as needed|as appropriate|automated|all formats|offline mode)\b",
    re.I,
)

LENS_CHECKS: list[tuple[str, str, re.Pattern[str], str, str, str, bool]] = [
    # (lens, category, pattern that, if ABSENT, raises the finding, severity, question, default, blocking)
    (
        "L2",
        "RBAC_AND_TENANCY_BOUNDARY",
        re.compile(r"\b(role|branch|region|head office|permission|access)\b", re.I),
        "HIGH",
        "Which roles exist, and can a user see records from another branch or organisation?",
        "Each user sees only records of their own branch; head-office roles see all branches read-only.",
        True,
    ),
    (
        "L3",
        "MISSING_NEGATIVE_OR_EDGE_CASE",
        re.compile(r"\b(reject\w*|cancel\w*|fail\w*|duplicate|retry|timeout)\b", re.I),
        "HIGH",
        "What happens when a request is rejected, cancelled after approval, submitted twice, or a partner system is down?",
        "Rejected and cancelled items keep their history; duplicates within 24 hours are blocked; partner downtime queues the request and retries for 4 hours.",
        False,
    ),
    (
        "L4",
        "COMPLIANCE_AND_RETENTION",
        re.compile(r"\b(retain|retention|purge|archiv\w*|delete)\b", re.I),
        "HIGH",
        "How long must records be kept, and when are they archived or deleted?",
        "Keep active records for 8 years in line with banking practice, archive after 2 years, purge on expiry with a logged record.",
        False,
    ),
    (
        "L4",
        "COMPLIANCE_AND_RETENTION",
        re.compile(r"\b(vapt|penetration|security test|cert-?in)\b", re.I),
        "MEDIUM",
        "Is a VAPT sign-off a go-live gate, and who appoints the auditor?",
        "VAPT by a CERT-In empanelled auditor appointed by the client is a go-live gate.",
        False,
    ),
    (
        "L4",
        "COMPLIANCE_AND_RETENTION",
        re.compile(r"\b(rto|rpo|recovery|downtime|availability|uptime)\b", re.I),
        "MEDIUM",
        "What is the maximum acceptable downtime and data loss?",
        "RTO 4 hours and RPO 15 minutes for customer-facing services.",
        False,
    ),
    (
        "L4",
        "COMPLIANCE_AND_RETENTION",
        re.compile(r"\b(ai|third[- ]party|share|vendor|bureau)\b", re.I),
        "MEDIUM",
        "What customer data may be sent to third parties or AI services, and may they keep it?",
        "Only masked data leaves the bank's systems; no third party keeps customer data after processing.",
        False,
    ),
    (
        "L5",
        "DATA_MIGRATION_AND_VOLUME",
        re.compile(r"\b(migrat\w*|legacy|volume|records|existing data)\b", re.I),
        "MEDIUM",
        "Is any data moving from an existing system, and how many records?",
        "No data migration; the system starts empty and grows by up to 50,000 records a month.",
        False,
    ),
]


def _tokens(obj: Any) -> int:
    return max(1, len(json.dumps(obj, sort_keys=True)) // 4)


def _title(sentence: str, words: int = 9) -> str:
    parts = re.sub(r"\s+", " ", sentence).strip().rstrip(".").split(" ")
    return " ".join(parts[:words]) + ("…" if len(parts) > words else "")


def _gwt(sentence: str) -> list[dict[str, str]]:
    actor_m = ACTOR_CUE.search(sentence)
    actor = actor_m.group(0).lower() if actor_m else "an authorised user"
    if not actor.startswith(("a ", "an ", "the ")):
        actor = f"a signed-in {actor}"
    clean = sentence.rstrip(".")
    return [
        {
            "given": f"{actor} with the required permission",
            "when": "they carry out the action described",
            "then": f"the system meets the need: {clean[0].lower() + clean[1:] if clean else clean}",
        }
    ]


def extract_requirements(payload: dict[str, Any]) -> dict[str, Any]:
    counters = {"FUNCTIONAL": 0, "NON_FUNCTIONAL": 0, "CONSTRAINT": 0}
    prefix = {"FUNCTIONAL": "FR", "NON_FUNCTIONAL": "NFR", "CONSTRAINT": "CON"}
    requirements: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source in payload.get("sources", []):
        for line_no, raw_line in enumerate(str(source.get("text", "")).splitlines(), start=1):
            line = raw_line.strip()
            location = f"line {line_no}"
            m = TRANSCRIPT_PREFIX.match(line)
            if m:
                location = f"{m.group(1)} ({m.group(2).strip()})"
                line = line[m.end() :]
            for sentence in SENTENCE_SPLIT.split(line):
                sentence = sentence.strip(" -*\t")
                key = sentence.lower()
                if len(sentence) < 12 or not REQUIREMENT_CUE.search(sentence) or key in seen:
                    continue
                seen.add(key)
                cue = REQUIREMENT_CUE.search(sentence).group(1).lower()  # type: ignore[union-attr]
                priority = (
                    "MUST"
                    if cue in {"must", "shall", "required", "require", "requires", "has to", "have to"}
                    else ("SHOULD" if cue == "should" else "COULD")
                )
                kind = (
                    "NON_FUNCTIONAL"
                    if NFR_CUE.search(sentence)
                    else "CONSTRAINT"
                    if CONSTRAINT_CUE.search(sentence)
                    else "FUNCTIONAL"
                )
                counters[kind] += 1
                requirements.append(
                    {
                        "code": f"{prefix[kind]}-{counters[kind]:03d}",
                        "title": _title(sentence),
                        "description": sentence,
                        "type": kind,
                        "priority": priority,
                        "citations": [{"sourceItemId": source["id"], "quote": sentence, "location": location}],
                        "acceptanceCriteria": _gwt(sentence) if kind == "FUNCTIONAL" else [],
                    }
                )
    return {"requirements": requirements}


def lens_findings(payload: dict[str, Any]) -> dict[str, Any]:
    reqs: list[dict[str, Any]] = payload.get("requirements", [])
    corpus = (
        " ".join(r.get("description", "") for r in reqs)
        + " "
        + " ".join(str(s.get("text", "")) for s in payload.get("sources", []))
    )
    findings: list[dict[str, Any]] = []
    if not reqs:
        findings.append(
            {
                "lens": "L6",
                "category": "COVERAGE",
                "description": "No requirement statements were found in the intake pack.",
                "severity": "HIGH",
                "question": "Can the client share the requirement MOMs or process documents?",
                "proposedDefault": "Hold BRD drafting until at least one MOM is available.",
                "relatedRequirementCodes": [],
                "blocking": True,
            }
        )
    for r in reqs:
        m = VAGUE.search(r.get("description", ""))
        if m:
            findings.append(
                {
                    "lens": "L1",
                    "category": "VAGUE_SLA_OR_METRIC",
                    "description": f'{r["code"]} uses "{m.group(0)}", which could mean very different amounts of work.',
                    "severity": "MEDIUM",
                    "question": f'What does "{m.group(0)}" mean in measurable terms for {r["code"]}?',
                    "proposedDefault": "Respond within 2 seconds for 95% of requests at the expected peak load.",
                    "relatedRequirementCodes": [r["code"]],
                    "blocking": False,
                }
            )
    for lens, category, pattern, severity, question, default, blocking in LENS_CHECKS:
        if not pattern.search(corpus):
            findings.append(
                {
                    "lens": lens,
                    "category": category,
                    "description": f"The intake pack does not say: {question[0].lower() + question[1:]}",
                    "severity": severity,
                    "question": question,
                    "proposedDefault": default,
                    "relatedRequirementCodes": [],
                    "blocking": blocking,
                }
            )
    return {"findings": findings}


def _cited(req: dict[str, Any], text: str) -> dict[str, Any]:
    return {
        "text": text,
        "citations": req.get("citations", []),
        "requirementCodes": [req["code"]],
        "aiSuggested": False,
    }


def _ai(text: str) -> dict[str, Any]:
    return {"text": text, "citations": [], "requirementCodes": [], "aiSuggested": True}


def draft_brd(payload: dict[str, Any]) -> dict[str, Any]:
    p = payload.get("project", {})
    name = p.get("name", "the project")
    client = p.get("clientName", "the client")
    reqs: list[dict[str, Any]] = payload.get("requirements", [])
    findings: list[dict[str, Any]] = payload.get("findings", [])
    fr = [r for r in reqs if r.get("type") == "FUNCTIONAL"]
    nfr = [r for r in reqs if r.get("type") == "NON_FUNCTIONAL"]
    con = [r for r in reqs if r.get("type") == "CONSTRAINT"]
    sources = payload.get("sources", [])
    by_lens = lambda lens: [f for f in findings if f.get("lens") == lens]  # noqa: E731

    def gwt_text(r: dict[str, Any]) -> str:
        crit = r.get("acceptanceCriteria") or []
        if not crit:
            return f"{r['code']}: {r['description']}"
        c = crit[0]
        return f"{r['code']}: {r['description']} Given {c['given']}, when {c['when']}, then {c['then']}."

    platforms = ", ".join(p.get("platforms", [])) or "to be confirmed"
    sections = [
        (
            "Document control",
            [
                _ai(
                    f"BRD v{payload.get('version', 1)} for {name} ({p.get('code', '')}), client {client}. Status Draft. Built from {len(sources)} intake documents."
                )
            ],
        ),
        (
            "Business context and goals",
            [
                _ai(
                    f"{client} needs {name} on {platforms}. Goals and measurable outcomes to be confirmed with the client sign-off owner."
                )
            ],
        ),
        (
            "Scope",
            [_cited(r, f"In scope: {r['title']} ({r['code']}).") for r in reqs if r.get("priority") != "COULD"]
            + [_ai("Out of scope: anything not traceable to the SOW or an approved change request.")],
        ),
        (
            "Stakeholders",
            [
                _ai(
                    "Client sign-off owner, client business users, client IT, Idealake BA, Tech Architect and delivery team."
                )
            ],
        ),
        (
            "Actors and tenancy",
            [
                _ai(f"Question for the client: {f['question']} Proposed default: {f['proposedDefault']}")
                for f in by_lens("L2")
            ]
            or [_ai("Actors and their tenancy scope are listed in the requirements below.")],
        ),
        (
            "Current and future process",
            [
                _ai(
                    "Current process taken from the client process documents; future process follows the functional requirements."
                )
            ],
        ),
        (
            "User journeys",
            [_cited(r, f"Journey step: {r['title']}.") for r in fr[:6]]
            + [
                _ai(f"Negative paths to confirm: {f['question']} Proposed default: {f['proposedDefault']}")
                for f in by_lens("L3")
            ],
        ),
        (
            "Business requirements",
            [_cited(r, f"{r['code']}: {r['description']}") for r in reqs if r.get("priority") == "MUST"],
        ),
        ("Functional requirements", [_cited(r, gwt_text(r)) for r in fr]),
        (
            "Business rules",
            [_cited(r, f"Rule from {r['code']}: {r['description']}") for r in con]
            or [_ai("Business rules to be confirmed with the client.")],
        ),
        (
            "Entity lifecycles",
            [
                _ai(
                    "Core records (for example an application) move Draft, Submitted, Under review, Approved or Rejected, Closed; cancellation after approval reverses with a reason."
                )
            ],
        ),
        (
            "Non-functional requirements",
            [_cited(r, f"{r['code']}: {r['description']}") for r in nfr]
            + [_ai(f"Proposed default: {f['proposedDefault']}") for f in by_lens("L1")],
        ),
        (
            "Governance and compliance",
            [
                _ai(f"Question for the client: {f['question']} Proposed default: {f['proposedDefault']}")
                for f in by_lens("L4")
            ]
            + ([_ai(f"Regulations named at intake: {p.get('regulations')}")] if p.get("regulations") else []),
        ),
        (
            "Constraints",
            [_cited(r, f"{r['code']}: {r['description']}") for r in con]
            or [_ai("No constraints stated beyond the SOW.")],
        ),
        (
            "Data, reporting and migration",
            [
                _ai(f"Question for the client: {f['question']} Proposed default: {f['proposedDefault']}")
                for f in by_lens("L5")
            ]
            or [_ai("No data migration in scope.")],
        ),
        (
            "Integrations",
            [
                _ai(
                    f"Integrations named at intake: {p.get('integrations')}. For each: direction, purpose, fallback if unavailable, cost owner."
                )
            ]
            if p.get("integrations")
            else [_ai("No integrations named at intake.")],
        ),
        (
            "Assumptions, dependencies and risks",
            [_ai(f"Proposed assumption (needs client confirmation): {f['proposedDefault']}") for f in findings[:8]],
        ),
        ("Open questions", [_ai(f"{f['question']}") for f in findings]),
        (
            "Glossary",
            [_ai("Terms used in this BRD are defined as they first appear; the client confirms domain terms.")],
        ),
        ("Exceptions granted", [_ai("None.")]),
    ]
    doc = {
        "title": f"BRD v{payload.get('version', 1)} — {name}",
        "sections": [{"heading": h, "statements": s} for h, s in sections],
    }
    return {"document": doc}


def deep_audit(payload: dict[str, Any]) -> dict[str, Any]:
    reqs: list[dict[str, Any]] = payload.get("requirements", [])
    findings: list[dict[str, Any]] = payload.get("findings", [])
    doc = payload.get("document", {})
    statements = [st for s in doc.get("sections", []) for st in s.get("statements", [])]
    gaps: list[dict[str, Any]] = []
    for f in findings:
        if f.get("status") != "OPEN":
            continue
        sev = (
            "CRITICAL_BLOCKER"
            if f.get("blocking")
            else ("HIGH_COST_OR_TIMELINE_IMPACT" if f.get("severity") == "HIGH" else "MEDIUM_UX_OR_OPERATIONAL_GAP")
        )
        gaps.append(
            {
                "gap_id": f"GAP-{len(gaps) + 1:03d}",
                "brd_ref": (f.get("relatedRequirementCodes") or ["OMITTED_FROM_DOCUMENT"])[0],
                "evidence_quote": "",
                "lens": {
                    "L1": "L1_SCOPE_AND_COST",
                    "L2": "L2_ACTORS_AND_TENANCY",
                    "L3": "L3_NEGATIVE_JOURNEYS",
                    "L4": "L4_GOVERNANCE",
                    "L5": "L5_DATA_MIGRATION_AND_VOLUME",
                }.get(f.get("lens", ""), "L6_DEFAULTS"),
                "category": f.get("category", "COMMERCIAL_OR_SCOPE_CREEP_TRAP"),
                "severity": sev,
                "flaw_or_ambiguity_description": f.get("description", ""),
                "stakeholder_clarification_question": f.get("question", ""),
                "recommended_default_assumption": f.get("proposedDefault", ""),
            }
        )
    for r in reqs:
        m = VAGUE.search(r.get("description", ""))
        if m:
            gaps.append(
                {
                    "gap_id": f"GAP-{len(gaps) + 1:03d}",
                    "brd_ref": r["code"],
                    "evidence_quote": r["description"],
                    "lens": "L1_SCOPE_AND_COST",
                    "category": "VAGUE_SLA_OR_METRIC",
                    "severity": "HIGH_COST_OR_TIMELINE_IMPACT",
                    "flaw_or_ambiguity_description": f'"{m.group(0)}" is not measurable.',
                    "stakeholder_clarification_question": f'What measurable value replaces "{m.group(0)}"?',
                    "recommended_default_assumption": "2 seconds for 95% of requests at expected peak.",
                }
            )
    critical = sum(1 for g in gaps if g["severity"] == "CRITICAL_BLOCKER")
    high = sum(1 for g in gaps if g["severity"] == "HIGH_COST_OR_TIMELINE_IMPACT")
    status = "BLOCKED_HIGH_RISK" if critical else ("NEEDS_CLARIFICATION" if gaps else "READY_FOR_FSD")
    unconfirmed = sum(1 for st in statements if st.get("aiSuggested") and not st.get("confirmed"))
    score = max(10, 95 - critical * 25 - high * 8 - len(gaps) * 2 - min(unconfirmed, 10))
    report = {
        "document_metadata": {
            "project_code": payload.get("project", {}).get("code", ""),
            "brd_version": str(payload.get("version", 1)),
            "project_name": payload.get("project", {}).get("name", ""),
            "domain_summary": payload.get("project", {}).get("domain", ""),
            "primary_business_objective": "See section 2 of the BRD.",
        },
        "readiness_assessment": {
            "status": status,
            "confidence_score": score,
            "estimation_risk_level": "CRITICAL"
            if critical
            else ("HIGH" if high > 2 else ("MEDIUM" if gaps else "LOW")),
            "executive_summary": (
                f"{len(reqs)} requirements and {len(gaps)} open gaps ({critical} critical, {high} high). "
                + (
                    "Resolve the critical gaps before submission."
                    if critical
                    else "Clarify open gaps with the client before sign-off."
                    if gaps
                    else "Ready for FSD."
                )
            ),
        },
        "adversarial_gap_matrix": gaps,
        "sign_off_blocker_questions": [
            {
                "priority_rank": i + 1,
                "question": g["stakeholder_clarification_question"],
                "gap_ids": [g["gap_id"]],
                "why_it_blocks_estimation": g["flaw_or_ambiguity_description"],
                "suggested_contractual_guardrail": "Needs commercial approval before it goes into the SOW.",
            }
            for i, g in enumerate([g for g in gaps if g["severity"] != "MEDIUM_UX_OR_OPERATIONAL_GAP"][:7])
        ],
    }
    return {"report": report}


HANDLERS = {
    "extract_requirements": extract_requirements,
    "lens_findings": lens_findings,
    "draft_brd": draft_brd,
    "deep_audit": deep_audit,
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
