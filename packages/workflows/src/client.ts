import { Client, Connection } from "@temporalio/client";

export type { Client as TemporalClient } from "@temporalio/client";
import { approveDocuments, approveRequirements, reject, returnWithComments, statusQuery } from "./signals.js";
import type { ApprovePayload, RejectPayload, ReturnPayload } from "./signals.js";
import {
  ORCHESTRATION_TASK_QUEUE,
  type DocumentationWorkflowInput,
  type WorkflowStatus,
} from "./types.js";

export interface TemporalSettings {
  address: string;
  namespace: string;
}

export async function createTemporalClient(s: TemporalSettings): Promise<Client> {
  const connection = await Connection.connect({ address: s.address });
  return new Client({ connection, namespace: s.namespace });
}

export function documentationWorkflowId(runId: string): string {
  return `documentation-${runId}`;
}

export async function startDocumentationWorkflow(client: Client, input: DocumentationWorkflowInput): Promise<string> {
  const handle = await client.workflow.start("documentationWorkflow", {
    taskQueue: ORCHESTRATION_TASK_QUEUE,
    workflowId: documentationWorkflowId(input.runId),
    args: [input],
    // Phase-gated workflows may live for weeks; no execution timeout on purpose.
  });
  return handle.workflowId;
}

export type GateSignal =
  | { name: "approveRequirements"; payload: ApprovePayload }
  | { name: "approveDocuments"; payload: ApprovePayload }
  | { name: "returnWithComments"; payload: ReturnPayload }
  | { name: "reject"; payload: RejectPayload };

export async function signalGate(client: Client, workflowId: string, signal: GateSignal): Promise<void> {
  const handle = client.workflow.getHandle(workflowId);
  switch (signal.name) {
    case "approveRequirements":
      return handle.signal(approveRequirements, signal.payload);
    case "approveDocuments":
      return handle.signal(approveDocuments, signal.payload);
    case "returnWithComments":
      return handle.signal(returnWithComments, signal.payload);
    case "reject":
      return handle.signal(reject, signal.payload);
  }
}

export async function queryStatus(client: Client, workflowId: string): Promise<WorkflowStatus> {
  return client.workflow.getHandle(workflowId).query(statusQuery);
}
