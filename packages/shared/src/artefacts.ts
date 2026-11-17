import { z } from "zod";
import { DomainSchema, EntityTypeSchema } from "./domain.js";

/** A pointer from a generated statement back to its source. */
export const CitationSchema = z.object({
  sourceItemId: z.string(),
  quote: z.string(),
  /** Free-form locator, e.g. "line 12" or "00:14:32 (Speaker)". */
  location: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const SOURCE_KINDS = ["UPLOAD", "IDHI_MEETING"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Intake document types (IN-G05). */
export const DOC_TAGS = ["SOW", "MOM", "PROCESS", "POLICY", "DESIGN", "API_DOC", "EXISTING_SYSTEM", "OTHER"] as const;
export const DocTagSchema = z.enum(DOC_TAGS);
export type DocTag = z.infer<typeof DocTagSchema>;
export const DOC_TAG_LABELS: Record<DocTag, string> = {
  SOW: "SOW",
  MOM: "MOM",
  PROCESS: "Process document",
  POLICY: "Policy",
  DESIGN: "Design",
  API_DOC: "API document",
  EXISTING_SYSTEM: "Existing system document",
  OTHER: "Other",
};

export const TagSourceSchema = z.object({
  docType: DocTagSchema,
  version: z.string().min(1).max(40),
  docDate: z.string().min(1).max(40),
  provider: z.string().min(1).max(120),
  personalData: z.boolean(),
});
export type TagSourceInput = z.infer<typeof TagSourceSchema>;

export const AcceptanceCriterionSchema = z.object({ given: z.string(), when: z.string(), then: z.string() });
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

/** Structured requirement as produced by the Documentation capability. */
export const ExtractedRequirementSchema = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(["FUNCTIONAL", "NON_FUNCTIONAL", "CONSTRAINT"]),
  priority: z.enum(["MUST", "SHOULD", "COULD"]),
  citations: z.array(CitationSchema).min(1),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).default([]),
});
export type ExtractedRequirement = z.infer<typeof ExtractedRequirementSchema>;

export const LENSES = ["L1", "L2", "L3", "L4", "L5", "L6"] as const;
export type Lens = (typeof LENSES)[number];
export const LENS_LABELS: Record<Lens, string> = {
  L1: "Scope and cost traps",
  L2: "Actors and tenancy",
  L3: "Negative journeys",
  L4: "Governance",
  L5: "Data migration and volumes",
  L6: "Pragmatic defaults",
};

/** A lens finding becomes a question for the client with a proposed default (BA blueprint 5.6). */
export const LensFindingSchema = z.object({
  lens: z.enum(LENSES),
  category: z.string(),
  description: z.string(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  question: z.string(),
  proposedDefault: z.string(),
  relatedRequirementCodes: z.array(z.string()).default([]),
  blocking: z.boolean().default(false),
});
export type LensFinding = z.infer<typeof LensFindingSchema>;

export const DOCUMENT_TYPES = ["BRD", "FSD", "API_SPEC"] as const;
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/** The 20 BRD sections of the BA blueprint (BRD-G02). */
export const BRD_SECTIONS = [
  "Document control",
  "Business context and goals",
  "Scope",
  "Stakeholders",
  "Actors and tenancy",
  "Current and future process",
  "User journeys",
  "Business requirements",
  "Functional requirements",
  "Business rules",
  "Entity lifecycles",
  "Non-functional requirements",
  "Governance and compliance",
  "Constraints",
  "Data, reporting and migration",
  "Integrations",
  "Assumptions, dependencies and risks",
  "Open questions",
  "Glossary",
  "Exceptions granted",
] as const;

/** Every statement in a generated document is either cited or explicitly marked AI-drafted. */
export const DocumentStatementSchema = z.object({
  text: z.string(),
  citations: z.array(CitationSchema).default([]),
  requirementCodes: z.array(z.string()).default([]),
  aiSuggested: z.boolean(),
  confirmed: z.boolean().optional(),
});
export type DocumentStatement = z.infer<typeof DocumentStatementSchema>;

export const DocumentContentSchema = z.object({
  title: z.string(),
  sections: z.array(z.object({ heading: z.string(), statements: z.array(DocumentStatementSchema) })),
});
export type DocumentContent = z.infer<typeof DocumentContentSchema>;

// ---------- Projects ----------

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().regex(/^[A-Z0-9]{2,8}$/, "2 to 8 capital letters or digits"),
  clientName: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  domain: DomainSchema,
  entityType: EntityTypeSchema.nullable().optional(),
  platforms: z.array(z.string()).min(1),
  government: z.boolean().default(false),
  existingProduction: z.boolean().default(false),
  accessibilityRequired: z.boolean().default(false),
  sowReference: z.string().max(120).optional(),
  clientSignoffOwner: z.string().min(3).max(200),
  regulations: z.string().max(500).optional(),
  integrations: z.string().max(500).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const SignoffSchema = z.object({
  signedByName: z.string().min(2).max(120),
  signedByEmail: z.email(),
  signedOn: z.string().min(8).max(30),
  note: z.string().max(1000).optional(),
});
export type SignoffInput = z.infer<typeof SignoffSchema>;

export const SelectStackSchema = z.object({
  stackKey: z.string(),
  domain: DomainSchema,
  entityType: EntityTypeSchema.nullable().optional(),
  rationale: z.string().min(10).max(2000),
});
export type SelectStackInput = z.infer<typeof SelectStackSchema>;

export const RequestExceptionSchema = z.object({
  projectId: z.string(),
  ruleId: z.string(),
  reason: z.string().min(10),
  compensatingControl: z.string().min(5),
  expiresAt: z.iso.datetime(),
});
export type RequestExceptionInput = z.infer<typeof RequestExceptionSchema>;
