import { fileURLToPath } from "node:url";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_TASK_QUEUE, ORCHESTRATION_TASK_QUEUE, type AiActivities, type ProjectContext, type RunEvent } from "../src/index.js";

// Runs the real workflows on Temporal's time-skipping test server with mocked activities.
// Set KRAMA_SKIP_TEMPORAL_TESTS=1 to skip when offline.
const skip = process.env.KRAMA_SKIP_TEMPORAL_TESTS === "1";

const project: ProjectContext = {
  code: "LOP", name: "Loan Origination", clientName: "Client A", domain: "BFSI", entityType: "COMMERCIAL_BANK",
  platforms: ["Web"], government: false, existingProduction: false, accessibilityRequired: false, integrations: null, regulations: null,
};

let env: TestWorkflowEnvironment;
const events: RunEvent[] = [];
let failExtract = false;

const ai: AiActivities = {
  async extractRequirements(input) {
    if (failExtract) throw new Error("ValueError: bad input");
    return {
      requirements: [{ code: "FR-001", title: "Login", description: "Users must log in", type: "FUNCTIONAL", priority: "MUST",
        citations: [{ sourceItemId: input.sources[0]!.id, quote: "must log in" }], acceptanceCriteria: [] }],
      usage: [],
    };
  },
  async lensFindings() {
    return { findings: [{ lens: "L4", category: "governance", description: "No retention", severity: "HIGH", question: "How long?", proposedDefault: "3 years", relatedRequirementCodes: [], blocking: false }], usage: [] };
  },
  async draftBrd(input) {
    return { document: { title: `BRD v${input.version}`, sections: [] }, usage: [] };
  },
  async deepAudit() {
    return { report: { readiness_assessment: { status: "NEEDS_CLARIFICATION", confidence_score: 70, estimation_risk_level: "MEDIUM", executive_summary: "ok" }, adversarial_gap_matrix: [], sign_off_blocker_questions: [] }, usage: [] };
  },
};

describe.skipIf(skip)("BRD workflows", () => {
  let workers: Worker[] = [];
  let running: Promise<void>[] = [];
  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
    const { nativeConnection } = env;
    workers = [
      await Worker.create({ connection: nativeConnection, taskQueue: ORCHESTRATION_TASK_QUEUE,
        workflowsPath: fileURLToPath(new URL("../src/workflows/index.ts", import.meta.url)),
        activities: { recordRunEvent: async (_id: string, e: RunEvent) => void events.push(e) } }),
      await Worker.create({ connection: nativeConnection, taskQueue: AI_TASK_QUEUE, activities: ai }),
    ];
    running = workers.map((w) => w.run());
  }, 120_000);
  afterAll(async () => {
    workers.forEach((w) => w.shutdown());
    await Promise.allSettled(running);
    await env?.teardown();
  });

  it("drafts requirements, lens findings and the BRD in order", async () => {
    events.length = 0;
    await env.client.workflow.execute("brdDraftWorkflow", {
      taskQueue: ORCHESTRATION_TASK_QUEUE, workflowId: "t1",
      args: [{ tenantId: "t", projectId: "p", runId: "r1", version: 1, project, sources: [{ id: "s1", title: "MOM", kind: "UPLOAD", docType: "MOM", version: "1", text: "Users must log in." }] }],
    });
    expect(events.map((e) => e.type)).toEqual(["stage", "requirements", "stage", "findings", "stage", "document"]);
  });

  it("records a failure event when the AI step fails", async () => {
    events.length = 0;
    failExtract = true;
    await expect(env.client.workflow.execute("brdDraftWorkflow", {
      taskQueue: ORCHESTRATION_TASK_QUEUE, workflowId: "t2",
      args: [{ tenantId: "t", projectId: "p", runId: "r2", version: 1, project, sources: [{ id: "s1", title: "MOM", kind: "UPLOAD", docType: "MOM", version: "1", text: "x" }] }],
    })).rejects.toThrow();
    failExtract = false;
    expect(events.at(-1)?.type).toBe("failed");
  }, 60_000);

  it("returns the Deep Audit report", async () => {
    const out = await env.client.workflow.execute("deepAuditWorkflow", {
      taskQueue: ORCHESTRATION_TASK_QUEUE, workflowId: "t3",
      args: [{ runId: "a1", tenantId: "t", projectId: "p", project, version: 1, document: { title: "BRD", sections: [] }, requirements: [], findings: [] }],
    });
    expect(out.report.readiness_assessment.status).toBe("NEEDS_CLARIFICATION");
  });
});
