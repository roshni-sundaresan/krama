// Types shared by the workflows, the TS worker, the API (client side) and — by convention —
// the Python AI worker (workers/ai/src/krama_ai/activities.py). Payloads are plain JSON.
import type { DocumentContent, ExtractedRequirement, LensFinding } from "@krama/shared";

/** Task queue served by the TypeScript worker (workflows + orchestration activities). */
export const ORCHESTRATION_TASK_QUEUE = "krama-orchestration";
/** Task queue served by the Python AI worker (model-backed activities). */
export const AI_TASK_QUEUE = "ai";

/** Prompt template versions recorded with every generated item (BRD-DG-07). */
export const PROMPT_VERSIONS = {
  extractRequirements: "extract-req/2",
  lensFindings: "lenses/1",
  draftBrd: "brd-20/1",
  deepAudit: "deep-audit/1",
} as const;

export interface SourceInput {
  id: string;
  title: string;
  kind: "UPLOAD" | "IDHI_MEETING";
  docType: string | null;
  version: string | null;
  /** Masked text only. Original text never leaves the API (BRD-DG-02). */
  text: string;
}

export interface ProjectContext {
  code: string;
  name: string;
  clientName: string;
  domain: string;
  entityType: string | null;
  platforms: string[];
  government: boolean;
  existingProduction: boolean;
  accessibilityRequired: boolean;
  integrations: string | null;
  regulations: string | null;
}

export interface TokenUsageRecord {
  provider: string;
  modelId: string;
  tier: "haiku" | "sonnet" | "opus";
  task: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// ---- AI activities (Python, task queue "ai") ----

export interface ExtractRequirementsInput {
  tenantId: string;
  projectId: string;
  project: ProjectContext;
  sources: SourceInput[];
}
export interface ExtractRequirementsOutput {
  requirements: ExtractedRequirement[];
  usage: TokenUsageRecord[];
}

export interface LensFindingsInput {
  tenantId: string;
  projectId: string;
  project: ProjectContext;
  sources: SourceInput[];
  requirements: ExtractedRequirement[];
}
export interface LensFindingsOutput {
  findings: LensFinding[];
  usage: TokenUsageRecord[];
}

export interface DraftBrdInput {
  tenantId: string;
  projectId: string;
  project: ProjectContext;
  version: number;
  requirements: ExtractedRequirement[];
  findings: LensFinding[];
  sources: SourceInput[];
}
export interface DraftBrdOutput {
  document: DocumentContent;
  usage: TokenUsageRecord[];
}

export interface DeepAuditInput {
  tenantId: string;
  projectId: string;
  project: ProjectContext;
  version: number;
  document: DocumentContent;
  requirements: (ExtractedRequirement & { confirmed: boolean })[];
  findings: (LensFinding & { code: string; status: string; answer: string | null })[];
}
/** Subset of the Krama_BRD_Deep_Audit schema (BA blueprint Appendix A) that Krama stores and shows. */
export interface DeepAuditReport {
  readiness_assessment: {
    status: "READY_FOR_FSD" | "NEEDS_CLARIFICATION" | "BLOCKED_HIGH_RISK";
    confidence_score: number;
    estimation_risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    executive_summary: string;
  };
  adversarial_gap_matrix: {
    gap_id: string;
    brd_ref: string;
    evidence_quote: string;
    lens: string;
    category: string;
    severity: "CRITICAL_BLOCKER" | "HIGH_COST_OR_TIMELINE_IMPACT" | "MEDIUM_UX_OR_OPERATIONAL_GAP";
    flaw_or_ambiguity_description: string;
    stakeholder_clarification_question: string;
    recommended_default_assumption: string;
  }[];
  sign_off_blocker_questions: { priority_rank: number; question: string; gap_ids: string[]; why_it_blocks_estimation: string }[];
  [key: string]: unknown;
}
export interface DeepAuditOutput {
  report: DeepAuditReport;
  usage: TokenUsageRecord[];
}

/** Activity names must match the Python `@activity.defn(name=...)` values. */
export interface AiActivities {
  extractRequirements(input: ExtractRequirementsInput): Promise<ExtractRequirementsOutput>;
  lensFindings(input: LensFindingsInput): Promise<LensFindingsOutput>;
  draftBrd(input: DraftBrdInput): Promise<DraftBrdOutput>;
  deepAudit(input: DeepAuditInput): Promise<DeepAuditOutput>;
}

// ---- Orchestration activities (TypeScript worker) ----

export type RunEvent =
  | { type: "stage"; stage: string; note?: string }
  | { type: "requirements"; requirements: ExtractedRequirement[]; usage: TokenUsageRecord[] }
  | { type: "findings"; findings: LensFinding[]; usage: TokenUsageRecord[] }
  | { type: "document"; document: DocumentContent; usage: TokenUsageRecord[]; promptVersions: Record<string, string> }
  | { type: "failed"; error: string };

export interface OrchestrationActivities {
  recordRunEvent(runId: string, event: RunEvent): Promise<void>;
}

// ---- Workflows ----

export interface BrdDraftWorkflowInput {
  tenantId: string;
  projectId: string;
  runId: string;
  version: number;
  project: ProjectContext;
  sources: SourceInput[];
}

export interface DeepAuditWorkflowInput extends DeepAuditInput {
  runId: string;
}
