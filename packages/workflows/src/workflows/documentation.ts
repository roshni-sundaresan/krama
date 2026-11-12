import { condition, proxyActivities, setHandler } from "@temporalio/workflow";
import type { ExtractedRequirement } from "@krama/shared";
import {
  approveDocuments,
  approveRequirements,
  reject,
  returnWithComments,
  statusQuery,
} from "../signals.js";
import {
  AI_TASK_QUEUE,
  type AiActivities,
  type DocumentationWorkflowInput,
  type DocumentationWorkflowResult,
  type OrchestrationActivities,
  type RunStage,
} from "../types.js";

// Model calls: bounded retries with backoff. Non-retryable errors (bad input) fail fast.
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

// Persistence callbacks into the API: more attempts, they are cheap and idempotent-ish.
const orch = proxyActivities<OrchestrationActivities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 10, initialInterval: "2 seconds", backoffCoefficient: 2, maximumInterval: "30 seconds" },
});

type Decision =
  | { kind: "approve"; by: string; comments?: string }
  | { kind: "return"; by: string; comments: string }
  | { kind: "reject"; by: string; reason: string };

/**
 * Phase 1 documentation path:
 *   extract requirements + gap report → [human gate: requirements] →
 *   draft BRD/SOW/FSD → [human gate: documents] → completed.
 * Human gates wait indefinitely (no timeout); "return with comments" loops back.
 */
export async function documentationWorkflow(input: DocumentationWorkflowInput): Promise<DocumentationWorkflowResult> {
  let stage: RunStage = "EXTRACTING";
  let decision: Decision | undefined;
  let requirementIterations = 0;
  let documentIterations = 0;
  let lastComments: string | undefined;

  const awaitingGate = () => stage === "AWAITING_REQUIREMENTS_APPROVAL" || stage === "AWAITING_DOCUMENTS_APPROVAL";

  setHandler(approveRequirements, ({ approvedBy, comments }) => {
    if (stage === "AWAITING_REQUIREMENTS_APPROVAL") decision = { kind: "approve", by: approvedBy, comments };
  });
  setHandler(approveDocuments, ({ approvedBy, comments }) => {
    if (stage === "AWAITING_DOCUMENTS_APPROVAL") decision = { kind: "approve", by: approvedBy, comments };
  });
  setHandler(returnWithComments, ({ by, comments }) => {
    if (awaitingGate()) decision = { kind: "return", by, comments };
  });
  setHandler(reject, ({ by, reason }) => {
    if (awaitingGate()) decision = { kind: "reject", by, reason };
  });
  setHandler(statusQuery, () => ({ stage, requirementIterations, documentIterations, lastComments }));

  const setStage = async (next: RunStage, note?: string) => {
    stage = next;
    await orch.recordRunEvent(input.runId, { type: "stage", stage: next, note });
  };

  /** Wait (no timeout) for a human decision at the current gate. */
  const waitForDecision = async (): Promise<Decision> => {
    decision = undefined;
    await condition(() => decision !== undefined);
    return decision!;
  };

  const base = { tenantId: input.tenantId, projectId: input.projectId };

  // ---- Gate 1: requirements ----
  let requirements: ExtractedRequirement[];
  for (;;) {
    requirementIterations++;
    await setStage("EXTRACTING");
    const extracted = await ai.extractRequirements({ ...base, sources: input.sources, reviewerComments: lastComments });
    requirements = extracted.requirements;
    await orch.recordRunEvent(input.runId, {
      type: "requirements",
      iteration: requirementIterations,
      requirements,
      usage: extracted.usage,
    });
    const gaps = await ai.gapReport({ ...base, sources: input.sources, requirements });
    await orch.recordRunEvent(input.runId, { type: "gaps", iteration: requirementIterations, gaps: gaps.gaps, usage: gaps.usage });

    await setStage("AWAITING_REQUIREMENTS_APPROVAL");
    const d = await waitForDecision();
    if (d.kind === "reject") {
      await setStage("REJECTED", `Requirements rejected by ${d.by}: ${d.reason}`);
      return { outcome: "REJECTED", requirementIterations, documentIterations };
    }
    if (d.kind === "return") {
      lastComments = d.comments;
      continue;
    }
    lastComments = undefined;
    break;
  }

  // ---- Gate 2: documents ----
  for (;;) {
    documentIterations++;
    await setStage("DRAFTING");
    for (const documentType of input.documentTypes) {
      const draft = await ai.draftDocument({
        ...base,
        projectName: input.projectName,
        documentType,
        requirements,
        sources: input.sources,
        reviewerComments: lastComments,
      });
      await orch.recordRunEvent(input.runId, {
        type: "document",
        iteration: documentIterations,
        documentType,
        document: draft.document,
        usage: draft.usage,
      });
    }
    await setStage("AWAITING_DOCUMENTS_APPROVAL");
    const d = await waitForDecision();
    if (d.kind === "reject") {
      await setStage("REJECTED", `Documents rejected by ${d.by}: ${d.reason}`);
      return { outcome: "REJECTED", requirementIterations, documentIterations };
    }
    if (d.kind === "return") {
      lastComments = d.comments;
      continue;
    }
    break;
  }

  await setStage("COMPLETED");
  return { outcome: "COMPLETED", requirementIterations, documentIterations };
}
