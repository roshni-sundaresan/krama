import { ApplicationFailure, proxyActivities } from "@temporalio/workflow";
import {
  AI_TASK_QUEUE,
  PROMPT_VERSIONS,
  type AiActivities,
  type BrdDraftWorkflowInput,
  type DeepAuditOutput,
  type DeepAuditWorkflowInput,
  type OrchestrationActivities,
} from "../types.js";

// Model calls: bounded retries with backoff. Bad input fails fast.
const ai = proxyActivities<AiActivities>({
  taskQueue: AI_TASK_QUEUE,
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumInterval: "1 minute",
    nonRetryableErrorTypes: ["ValueError", "ValidationError"],
  },
});

const orch = proxyActivities<OrchestrationActivities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 10, initialInterval: "2 seconds", backoffCoefficient: 2, maximumInterval: "30 seconds" },
});

/**
 * Draft a BRD from the intake pack (masked text only):
 * requirements with citations and Given/When/Then → lens findings (L1–L6) → 20-section BRD.
 * Human steps (confirm, submit, Deep Audit, approve, client sign-off) happen in the API afterwards.
 */
export async function brdDraftWorkflow(input: BrdDraftWorkflowInput): Promise<void> {
  const base = { tenantId: input.tenantId, projectId: input.projectId, project: input.project };
  try {
    await orch.recordRunEvent(input.runId, { type: "stage", stage: "EXTRACTING" });
    const extracted = await ai.extractRequirements({ ...base, sources: input.sources });
    await orch.recordRunEvent(input.runId, { type: "requirements", requirements: extracted.requirements, usage: extracted.usage });

    await orch.recordRunEvent(input.runId, { type: "stage", stage: "LENSES" });
    const lens = await ai.lensFindings({ ...base, sources: input.sources, requirements: extracted.requirements });
    await orch.recordRunEvent(input.runId, { type: "findings", findings: lens.findings, usage: lens.usage });

    await orch.recordRunEvent(input.runId, { type: "stage", stage: "DRAFTING" });
    const draft = await ai.draftBrd({
      ...base,
      version: input.version,
      requirements: extracted.requirements,
      findings: lens.findings,
      sources: input.sources,
    });
    await orch.recordRunEvent(input.runId, {
      type: "document",
      document: draft.document,
      usage: draft.usage,
      promptVersions: { ...PROMPT_VERSIONS },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await orch.recordRunEvent(input.runId, { type: "failed", error: message });
    throw ApplicationFailure.nonRetryable(message);
  }
}

/** Deep Audit at submission (BA blueprint 5.7). The API waits for the result. */
export async function deepAuditWorkflow(input: DeepAuditWorkflowInput): Promise<DeepAuditOutput> {
  const { runId: _runId, ...payload } = input;
  return ai.deepAudit(payload);
}
