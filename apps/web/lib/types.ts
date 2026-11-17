import type { Domain, EntityType, Role } from "@krama/shared";
import type { PipeStep } from "@/components/ui";

export interface Member { userId: string; user: { id: string; name: string; email: string; roles: Role[] } }
export interface Project {
  id: string; code: string; name: string; clientName: string; description: string | null; domain: Domain; entityType: EntityType | null;
  domainConfirmed: boolean; platforms: string[]; government: boolean; existingProduction: boolean; accessibilityRequired: boolean;
  sowReference: string | null; clientSignoffOwner: string | null; regulations: string | null; integrations: string | null;
  stackKey: string | null; stackRationale: string | null; stackSelectedAt: string | null; createdAt: string;
  members: Member[]; pipeline: PipeStep[]; currentPhase: string;
}
export interface Source {
  id: string; kind: "UPLOAD" | "IDHI_MEETING"; title: string; mimeType: string | null; sizeBytes: number | null; externalRef: string | null;
  docType: string | null; version: string | null; docDate: string | null; provider: string | null; personalData: boolean;
  piiFindings: { type: string; count: number }[]; injectionFlags: string[]; maskingConfirmedAt: string | null; createdAt: string; maskedText: string;
}
export interface Readiness { ready: boolean; rules: { id: string; title: string; level: string; passed: boolean; note: string }[] }
export interface Person { id: string; name: string; email: string; roles: Role[] }

export interface Statement { text: string; citations: { sourceItemId: string; quote: string; location?: string }[]; requirementCodes: string[]; aiSuggested: boolean; confirmed?: boolean }
export interface Requirement {
  id: string; code: string; title: string; description: string; type: "FUNCTIONAL" | "NON_FUNCTIONAL" | "CONSTRAINT"; priority: "MUST" | "SHOULD" | "COULD";
  citations: { sourceItemId: string; quote: string; location?: string }[]; acceptanceCriteria: { given: string; when: string; then: string }[]; aiDrafted: boolean; confirmed: boolean;
}
export interface Finding {
  id: string; code: string; lens: "L1" | "L2" | "L3" | "L4" | "L5" | "L6"; category: string; description: string; severity: "LOW" | "MEDIUM" | "HIGH"; question: string;
  proposedDefault: string; blocking: boolean; relatedRequirementCodes: string[]; status: "OPEN" | "ANSWERED" | "DEFAULT_ACCEPTED"; answer: string | null;
}
export interface Gap {
  lens: string; gap_id: string; brd_ref: string; category: string; severity: string; evidence_quote: string; flaw_or_ambiguity_description: string;
  recommended_default_assumption: string; stakeholder_clarification_question: string;
}
export interface Workspace {
  project: Project;
  document: null | {
    id: string; version: number; status: "DRAFTING" | "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "CLIENT_SIGNED_OFF" | "SUPERSEDED";
    content: { title: string; sections: { heading: string; statements: Statement[] }[] }; generation: { model?: string; provider?: string; generatedAt?: string } | null;
    submittedAt: string | null; approvedById: string | null; approvedAt: string | null; reviewNote: string | null; unconfirmed: number; createdAt: string;
  };
  requirements: Requirement[];
  findings: Finding[];
  sources: { id: string; title: string; kind: string; docType: string | null; version: string | null }[];
  run: null | { status: string; stage: string; error: string | null; startedAt: string };
  audit: null | {
    status: "READY_FOR_FSD" | "NEEDS_CLARIFICATION" | "BLOCKED_HIGH_RISK"; criticalCount: number; documentVersion: number; createdAt: string;
    ruleFindings: { rule: string; severity: string; ref: string; message: string; quote?: string }[];
    aiReport: {
      readiness_assessment?: { status: string; confidence_score: number; executive_summary: string; estimation_risk_level: string };
      adversarial_gap_matrix?: Gap[];
      sign_off_blocker_questions?: { gap_ids: string[]; question: string; priority_rank: number; why_it_blocks_estimation: string; suggested_contractual_guardrail: string }[];
    } | null;
  };
  signoff: null | { signedByName: string; signedByEmail: string; signedOn: string; note: string | null; evidenceName: string | null; createdAt: string };
  versions: { id: string; version: number; status: string; createdAt: string }[];
}

export interface StackDef { key: string; name: string; summary: string; layers: Record<string, string>; platforms: string[]; topics: string[]; checklist: { id: string; name: string; version: string; verify: string; required: boolean }[] }
export interface PackRule { id: string; vertical: string; topic: string; level: "NON_WAIVABLE" | "BLOCK" | "WARN"; title: string; text: string; sources: string[]; check?: { type: string } | null }
export interface Pack {
  id: string; version: number; status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "SUPERSEDED" | "WITHDRAWN"; domain: string; entityType: string | null; stackKey: string; flags: string[];
  content: { rules: PackRule[]; stack: { key: string; name: string; layers: Record<string, string> }; checklist: StackDef["checklist"]; blueprints: { vertical: string; title: string; sections: { heading: string; items: string[] }[] }[]; regulations: { id: string; name: string; version: string }[] };
  approvedAt: string | null; decisionNote: string | null; createdAt: string;
}
export interface Adr { id: string; number: number; title: string; context: string; decision: string; consequences: string; createdAt: string }
