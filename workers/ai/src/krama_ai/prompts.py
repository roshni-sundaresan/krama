"""Prompts for real model providers. The stub provider ignores these and uses the payload."""

from __future__ import annotations

import json
from typing import Any

COMMON = (
    "You are the Krama Documentation capability at Idealake. Output ONLY a JSON object, no prose. "
    "Never invent facts: every statement must cite the source item id and an exact quote. "
    "If something is needed but not in the sources, mark it aiSuggested=true with no citations."
)

SYSTEM = {
    "extract_requirements": COMMON + ' Schema: {"requirements":[{"code":"REQ-001","title":str,"description":str,'
    '"type":"FUNCTIONAL|NON_FUNCTIONAL|CONSTRAINT","priority":"MUST|SHOULD|COULD",'
    '"citations":[{"sourceItemId":str,"quote":str,"location":str}]}]}',
    "gap_report": COMMON + ' Schema: {"gaps":[{"category":str,"description":str,"severity":"LOW|MEDIUM|HIGH",'
    '"relatedRequirementCodes":[str]}]}. Look for missing NFRs, ambiguity, conflicts, missing actors.',
    "draft_document": COMMON + ' Schema: {"document":{"title":str,"sections":[{"heading":str,"statements":[{"text":str,'
    '"citations":[{"sourceItemId":str,"quote":str}],"requirementCodes":[str],"aiSuggested":bool}]}]}}',
}


def build_prompt(task: str, payload: dict[str, Any]) -> str:
    return f"Task: {task}\nInput:\n{json.dumps(payload, ensure_ascii=False, indent=1)}"
