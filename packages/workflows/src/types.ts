// Types shared by the workflow, the TS worker, the API (client side) and — by
// convention — the Python AI worker (workers/ai/src/krama_ai/activities.py).
// Payloads are plain JSON; keep field names in sync with the Python side.
import type { DocumentContent, DocumentType, ExtractedRequirement, Gap } from "@krama/shared";

/** Task queue served by the TypeScript worker (workflows + orchestration activities). */
export const ORCHESTRATION_TASK_QUEUE = "krama-orchestration";
/** Task queue served by the Python AI worker (model-backed activities). */
export const AI_TASK_QUEUE = "ai";

export interface SourceInput {
  id: string;
  title: string;
  kind: "UPLOAD" | "IDHI_MEETING";
  /** Extracted plain text. TODO: pass object-storage refs instead once sources get large (Temporal 2MB payload limit). */
  text: string;
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

// ---- AI activities (implemented in Python, task queue "ai") ----

export interface ExtractRequirementsInput {
  tenantId: string;
  projectId: string;
  sources: SourceInput[];
  reviewerComments?: string;
}
export interface ExtractRequirementsOutput {
  requirements: ExtractedRequirement[];
  usage: TokenUsageRecord[];
}

export interface GapReportInput {
  tenantId: string;
  projectId: string;
  sources: SourceInput[];
  requirements: ExtractedRequirement[];
}
export interface GapReportOutput {
  gaps: Gap[];
  usage: TokenUsageRecord[];
}

export interface DraftDocumentInput {
  tenantId: string;
  projectId: string;
  projectName: string;
  documentType: DocumentType;
  requirements: ExtractedRequirement[];
  sources: SourceInput[];
  reviewerComments?: string;
}
export interface DraftDocumentOutput {
  document: DocumentContent;
  usage: TokenUsageRecord[];
}

/** Activity names must match the Python `@activity.defn(name=...)` values. */
export interface AiActivities {
  extractRequirements(input: ExtractRequirementsInput): Promise<ExtractRequirementsOutput>;
  gapReport(input: GapReportInput): Promise<GapReportOutput>;
  draftDocument(input: DraftDocumentInput): Promise<DraftDocumentOutput>;
}

// ---- Orchestration activities (TypeScript worker) ----

export type RunStage =
  | "EXTRACTING"
  | "AWAITING_REQUIREMENTS_APPROVAL"
  | "DRAFTING"
  | "AWAITING_DOCUMENTS_APPROVAL"
  | "COMPLETED"
  | "REJECTED";

export type RunEvent =
  | { type: "stage"; stage: RunStage; note?: string }
  | { type: "requirements"; iteration: number; requirements: ExtractedRequirement[]; usage: TokenUsageRecord[] }
  | { type: "gaps"; iteration: number; gaps: Gap[]; usage: TokenUsageRecord[] }
  | { type: "document"; iteration: number; documentType: DocumentType; document: DocumentContent; usage: TokenUsageRecord[] };

export interface OrchestrationActivities {
  /** Persist a workflow event back into the Krama API (artefacts, stage changes, token usage). */
  recordRunEvent(runId: string, event: RunEvent): Promise<void>;
}

// ---- Workflow ----

export interface DocumentationWorkflowInput {
  tenantId: string;
  projectId: string;
  projectName: string;
  runId: string;
  sources: SourceInput[];
  documentTypes: DocumentType[];
}

export interface DocumentationWorkflowResult {
  outcome: "COMPLETED" | "REJECTED";
  requirementIterations: number;
  documentIterations: number;
}

export interface WorkflowStatus {
  stage: RunStage;
  requirementIterations: number;
  documentIterations: number;
  lastComments?: string;
}
