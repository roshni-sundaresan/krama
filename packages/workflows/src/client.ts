import { Client, Connection } from "@temporalio/client";
import { ORCHESTRATION_TASK_QUEUE, type BrdDraftWorkflowInput, type DeepAuditOutput, type DeepAuditWorkflowInput } from "./types.js";

export type { Client as TemporalClient } from "@temporalio/client";

export interface TemporalSettings {
  address: string;
  namespace: string;
}

export async function createTemporalClient(s: TemporalSettings): Promise<Client> {
  const connection = await Connection.connect({ address: s.address });
  return new Client({ connection, namespace: s.namespace });
}

export async function startBrdDraftWorkflow(client: Client, input: BrdDraftWorkflowInput): Promise<string> {
  const handle = await client.workflow.start("brdDraftWorkflow", {
    taskQueue: ORCHESTRATION_TASK_QUEUE,
    workflowId: `brd-draft-${input.runId}`,
    args: [input],
    workflowExecutionTimeout: "1 hour",
  });
  return handle.workflowId;
}

/** Runs the Deep Audit and waits for its result. */
export async function runDeepAuditWorkflow(client: Client, input: DeepAuditWorkflowInput): Promise<DeepAuditOutput> {
  return client.workflow.execute("deepAuditWorkflow", {
    taskQueue: ORCHESTRATION_TASK_QUEUE,
    workflowId: `deep-audit-${input.runId}`,
    args: [input],
    workflowExecutionTimeout: "15 minutes",
  });
}
