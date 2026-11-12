import { z } from "zod";
import { DepthModeSchema } from "./guardrails.js";

/** A pointer from a generated statement back to its source. */
export const CitationSchema = z.object({
  sourceItemId: z.string(),
  quote: z.string(),
  /** Free-form locator, e.g. "line 12" or "00:14:32". */
  location: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const SOURCE_KINDS = ["UPLOAD", "IDHI_MEETING"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface SourceItemDto {
  id: string;
  projectId: string;
  kind: SourceKind;
  title: string;
  mimeType: string | null;
  externalRef: string | null;
  createdAt: string;
}

export const REQUIREMENT_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "RETURNED", "REJECTED"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/** Structured requirement as produced by the Documentation capability. */
export const ExtractedRequirementSchema = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(["FUNCTIONAL", "NON_FUNCTIONAL", "CONSTRAINT"]),
  priority: z.enum(["MUST", "SHOULD", "COULD"]),
  citations: z.array(CitationSchema).min(1),
});
export type ExtractedRequirement = z.infer<typeof ExtractedRequirementSchema>;

export interface RequirementDto extends ExtractedRequirement {
  id: string;
  projectId: string;
  status: RequirementStatus;
}

export const GapSchema = z.object({
  category: z.string(),
  description: z.string(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  relatedRequirementCodes: z.array(z.string()).default([]),
});
export type Gap = z.infer<typeof GapSchema>;
export interface GapDto extends Gap {
  id: string;
  projectId: string;
  status: "OPEN" | "RESOLVED" | "ACCEPTED";
}

export const DOCUMENT_TYPES = ["BRD", "SOW", "FSD"] as const;
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/** Every statement in a generated document is either cited or explicitly marked AI-suggested. */
export const DocumentStatementSchema = z.object({
  text: z.string(),
  citations: z.array(CitationSchema).default([]),
  requirementCodes: z.array(z.string()).default([]),
  aiSuggested: z.boolean(),
});
export type DocumentStatement = z.infer<typeof DocumentStatementSchema>;

export const DocumentContentSchema = z.object({
  title: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      statements: z.array(DocumentStatementSchema),
    }),
  ),
});
export type DocumentContent = z.infer<typeof DocumentContentSchema>;

export interface DocumentDto {
  id: string;
  projectId: string;
  type: DocumentType;
  version: number;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "RETURNED" | "REJECTED";
  content: DocumentContent;
  createdAt: string;
}

export const PROJECT_PHASES = ["INPUTS", "REQUIREMENTS", "DOCUMENTS", "BUILD"] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  clientWork: z.boolean().default(false),
  clientName: z.string().optional(),
  projectType: z.string().min(1).default("web-app"),
  technology: z.string().min(1).default("typescript-node"),
  depthMode: DepthModeSchema.default("guided"),
  targetPlatforms: z.array(z.string()).default([]),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export interface ProjectDto extends CreateProjectInput {
  id: string;
  tenantId: string;
  phase: ProjectPhase;
  createdAt: string;
}

export const APPROVAL_SUBJECTS = ["REQUIREMENTS", "DOCUMENTS", "EXCEPTION"] as const;
export type ApprovalSubject = (typeof APPROVAL_SUBJECTS)[number];
export type ApprovalStatus = "PENDING" | "APPROVED" | "RETURNED" | "REJECTED";

export interface ApprovalDto {
  id: string;
  projectId: string | null;
  subjectType: ApprovalSubject;
  subjectId: string;
  status: ApprovalStatus;
  summary: string;
  requestedBy: { id: string; name: string };
  comments: string | null;
  createdAt: string;
}

export const DecideApprovalSchema = z.object({
  decision: z.enum(["APPROVE", "RETURN", "REJECT"]),
  comments: z.string().max(4000).optional(),
});
export type DecideApprovalInput = z.infer<typeof DecideApprovalSchema>;

export const RequestExceptionSchema = z.object({
  projectId: z.string(),
  ruleId: z.string(),
  reason: z.string().min(10),
  scope: z.enum(["project", "change"]),
  changeRef: z.string().optional(),
  paths: z.array(z.string()).default([]),
  expiresAt: z.iso.datetime(),
});
export type RequestExceptionInput = z.infer<typeof RequestExceptionSchema>;

export interface CapabilityDto {
  id: string;
  name: string;
  version: string;
  kind: "AGENT" | "TOOL" | "PRODUCT";
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  inputs: string[];
  outputs: string[];
  permissions: string[];
  evalScore: number | null;
}
