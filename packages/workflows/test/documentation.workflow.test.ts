import { fileURLToPath } from "node:url";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AI_TASK_QUEUE,
  ORCHESTRATION_TASK_QUEUE,
  approveDocuments,
  approveRequirements,
  returnWithComments,
  statusQuery,
  type AiActivities,
  type RunEvent,
  type WorkflowStatus,
} from "../src/index.js";

// Runs the real workflow against Temporal's time-skipping test server with mocked activities.
// The test server binary is downloaded on first use; set KRAMA_SKIP_TEMPORAL_TESTS=1 to skip offline.
const skip = process.env.KRAMA_SKIP_TEMPORAL_TESTS === "1";

let env: TestWorkflowEnvironment;
const events: RunEvent[] = [];
const extractCalls: (string | undefined)[] = [];

const aiActivities: AiActivities = {
  async extractRequirements(input) {
    extractCalls.push(input.reviewerComments);
    return {
      requirements: [
        {
          code: "REQ-001",
          title: "Login",
          description: "Users must log in",
          type: "FUNCTIONAL",
          priority: "MUST",
          citations: [{ sourceItemId: input.sources[0]!.id, quote: "must log in" }],
        },
      ],
      usage: [],
    };
  },
  async gapReport() {
    return { gaps: [{ category: "security", description: "No MFA policy", severity: "HIGH", relatedRequirementCodes: [] }], usage: [] };
  },
  async draftDocument(input) {
    return { document: { title: input.documentType, sections: [] }, usage: [] };
  },
};

async function waitForStage(
  handle: { query: (q: typeof statusQuery) => Promise<WorkflowStatus> },
  stage: string,
  minRequirementIterations = 1,
) {
  for (let i = 0; i < 100; i++) {
    const s = await handle.query(statusQuery);
    if (s.stage === stage && s.requirementIterations >= minRequirementIterations) return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for stage ${stage}`);
}

describe.skipIf(skip)("documentationWorkflow", () => {
  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  }, 120_000);
  afterAll(async () => {
    await env?.teardown();
  });

  it("extracts, waits for approval, loops on return-with-comments, drafts docs and completes", async () => {
    const { client, nativeConnection } = env;
    const orchWorker = await Worker.create({
      connection: nativeConnection,
      taskQueue: ORCHESTRATION_TASK_QUEUE,
      workflowsPath: fileURLToPath(new URL("../src/workflows/index.ts", import.meta.url)),
      activities: { recordRunEvent: async (_runId: string, e: RunEvent) => void events.push(e) },
    });
    const aiWorker = await Worker.create({ connection: nativeConnection, taskQueue: AI_TASK_QUEUE, activities: aiActivities });

    const scenario = async () => {
      const handle = await client.workflow.start("documentationWorkflow", {
        taskQueue: ORCHESTRATION_TASK_QUEUE,
        workflowId: "test-doc-1",
        args: [{
          tenantId: "t1", projectId: "p1", projectName: "Demo", runId: "run1",
          sources: [{ id: "src1", title: "Notes", kind: "UPLOAD", text: "Users must log in." }],
          documentTypes: ["BRD", "SOW"],
        }],
      });
      await waitForStage(handle, "AWAITING_REQUIREMENTS_APPROVAL");
      await handle.signal(returnWithComments, { by: "approver", comments: "Add MFA" });
      await waitForStage(handle, "AWAITING_REQUIREMENTS_APPROVAL", 2);
      expect((await handle.query(statusQuery)).requirementIterations).toBe(2);
      await handle.signal(approveRequirements, { approvedBy: "approver" });
      await waitForStage(handle, "AWAITING_DOCUMENTS_APPROVAL");
      await handle.signal(approveDocuments, { approvedBy: "approver" });
      return handle.result();
    };
    const result = await orchWorker.runUntil(aiWorker.runUntil(scenario));

    expect(result).toEqual({ outcome: "COMPLETED", requirementIterations: 2, documentIterations: 1 });
    expect(extractCalls).toEqual([undefined, "Add MFA"]);
    expect(events.filter((e) => e.type === "document")).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: "stage", stage: "COMPLETED" });
  }, 120_000);
});

