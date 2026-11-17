from krama_ai.providers.stub import deep_audit, draft_brd, extract_requirements, lens_findings

from .conftest import SOURCES

PROJECT = {
    "code": "LOP",
    "name": "Loan Origination",
    "clientName": "Client A",
    "domain": "BFSI",
    "platforms": ["Web"],
    "integrations": "Core banking",
}


def test_extract_requirements_is_deterministic_cited_and_has_gwt():
    first = extract_requirements({"sources": SOURCES})
    assert first == extract_requirements({"sources": SOURCES})
    reqs = first["requirements"]
    assert all("weather" not in r["description"] for r in reqs)
    by_code = {r["code"]: r for r in reqs}
    assert {"FR-001", "CON-001", "NFR-001"} <= set(by_code)
    for r in reqs:
        assert r["citations"][0]["quote"] in r["description"]
        if r["type"] == "FUNCTIONAL":
            assert r["acceptanceCriteria"] and {"given", "when", "then"} <= set(r["acceptanceCriteria"][0])


def test_lens_findings_have_question_and_default():
    reqs = extract_requirements({"sources": SOURCES})["requirements"]
    findings = lens_findings({"sources": SOURCES, "requirements": reqs})["findings"]
    lenses = {f["lens"] for f in findings}
    assert {"L1", "L3", "L4"} <= lenses  # vague "fast", no negative paths, no retention
    assert all(f["question"] and f["proposedDefault"] for f in findings)


def test_draft_brd_has_twenty_sections_in_order():
    reqs = extract_requirements({"sources": SOURCES})["requirements"]
    findings = lens_findings({"sources": SOURCES, "requirements": reqs})["findings"]
    doc = draft_brd({"project": PROJECT, "version": 1, "requirements": reqs, "findings": findings, "sources": SOURCES})[
        "document"
    ]
    assert len(doc["sections"]) == 20
    assert doc["sections"][0]["heading"] == "Document control"
    assert doc["sections"][-1]["heading"] == "Exceptions granted"


def test_deep_audit_blocks_on_blocking_open_question():
    findings = [
        {
            "lens": "L2",
            "category": "RBAC_AND_TENANCY_BOUNDARY",
            "description": "d",
            "severity": "HIGH",
            "question": "q",
            "proposedDefault": "x",
            "relatedRequirementCodes": [],
            "blocking": True,
            "status": "OPEN",
        }
    ]
    report = deep_audit({"project": PROJECT, "requirements": [], "findings": findings, "document": {"sections": []}})[
        "report"
    ]
    assert report["readiness_assessment"]["status"] == "BLOCKED_HIGH_RISK"
    findings[0]["status"] = "ANSWERED"
    report = deep_audit({"project": PROJECT, "requirements": [], "findings": findings, "document": {"sections": []}})[
        "report"
    ]
    assert report["readiness_assessment"]["status"] == "READY_FOR_FSD"
