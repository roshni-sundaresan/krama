from krama_ai.providers.stub import draft_document, extract_requirements, gap_report

from .conftest import SOURCES


def test_extract_requirements_is_deterministic_and_cited():
    first = extract_requirements({"sources": SOURCES})
    second = extract_requirements({"sources": SOURCES})
    assert first == second
    reqs = first["requirements"]
    assert [r["code"] for r in reqs] == ["REQ-001", "REQ-002", "REQ-003", "REQ-004", "REQ-005"]
    # non-requirement chatter is ignored
    assert all("weather" not in r["description"] for r in reqs)
    for r in reqs:
        assert r["citations"], r
        assert r["citations"][0]["sourceItemId"] in {"src-meeting-1", "src-doc-1"}
        assert r["citations"][0]["quote"] in r["description"]
    by_code = {r["code"]: r for r in reqs}
    assert by_code["REQ-001"]["priority"] == "MUST"
    assert by_code["REQ-002"]["priority"] == "SHOULD"
    assert by_code["REQ-003"]["type"] == "CONSTRAINT"
    assert by_code["REQ-005"]["type"] == "NON_FUNCTIONAL"  # audit trail
    assert by_code["REQ-004"]["citations"][0]["location"] == "line 1"


def test_gap_report_flags_missing_nfrs_and_vague_wording():
    reqs = extract_requirements({"sources": SOURCES})["requirements"]
    gaps = gap_report({"requirements": reqs})["gaps"]
    categories = {g["category"] for g in gaps}
    assert "performance" in categories
    assert "accessibility" in categories
    assert "security" not in categories  # SSO login is mentioned
    vague = [g for g in gaps if g["category"] == "ambiguity"]
    assert vague and vague[0]["relatedRequirementCodes"] == ["REQ-002"]


def test_gap_report_on_empty_requirements():
    gaps = gap_report({"requirements": []})["gaps"]
    assert gaps[0]["category"] == "coverage"
    assert gaps[0]["severity"] == "HIGH"


def test_draft_documents_cite_or_mark_ai_suggested():
    reqs = extract_requirements({"sources": SOURCES})["requirements"]
    for doc_type in ("BRD", "SOW", "FSD"):
        doc = draft_document({"documentType": doc_type, "projectName": "Demo", "requirements": reqs})["document"]
        assert doc["title"].startswith(doc_type)
        statements = [s for sec in doc["sections"] for s in sec["statements"]]
        assert statements
        for s in statements:
            assert s["aiSuggested"] or s["citations"], s


def test_transcript_prefix_becomes_location():
    src = [{"id": "m1", "text": "[00:09:30] Meera: The portal must use the company SSO for staff login."}]
    req = extract_requirements({"sources": src})["requirements"][0]
    assert req["description"].startswith("The portal must")
    assert req["citations"][0]["location"] == "00:09:30 (Meera)"
