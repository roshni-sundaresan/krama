import { defineQuery, defineSignal } from "@temporalio/workflow";
import type { WorkflowStatus } from "./types.js";

export interface ApprovePayload {
  approvedBy: string;
  comments?: string;
}
export interface ReturnPayload {
  by: string;
  comments: string;
}
export interface RejectPayload {
  by: string;
  reason: string;
}

/** Human gate 1: approver approves the structured requirements. */
export const approveRequirements = defineSignal<[ApprovePayload]>("approveRequirements");
/** Human gate 2: approver approves the drafted BRD/SOW/FSD. */
export const approveDocuments = defineSignal<[ApprovePayload]>("approveDocuments");
/** Return the artefacts at the current gate for rework, with reviewer comments. */
export const returnWithComments = defineSignal<[ReturnPayload]>("returnWithComments");
/** Reject at the current gate; ends the workflow. */
export const reject = defineSignal<[RejectPayload]>("reject");

export const statusQuery = defineQuery<WorkflowStatus>("status");
