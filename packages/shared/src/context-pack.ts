import { z } from "zod";
import { DepthModeSchema, GuardrailExceptionsFileSchema, GuardrailRuleSetFileSchema } from "./guardrails.js";

export const CODING_TOOLS = ["claude", "copilot", "codex"] as const;
export const CodingToolSchema = z.enum(CODING_TOOLS);
export type CodingTool = z.infer<typeof CodingToolSchema>;

/** One entry of the required-software checklist (`krama check`). */
export const ChecklistItemSchema = z.object({
  name: z.string(),
  /** Executable to probe with `<command> --version`. */
  command: z.string(),
  /** Minimum semver-ish version (major.minor.patch). Optional. */
  minVersion: z.string().optional(),
  required: z.boolean().default(true),
  installHint: z.string().default(""),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ChecklistFileSchema = z.object({
  mode: DepthModeSchema.default("guided"),
  items: z.array(ChecklistItemSchema),
});
export type ChecklistFile = z.infer<typeof ChecklistFileSchema>;

/**
 * Context pack: everything the developer's local Krama CLI needs to run an
 * approved coding tool against approved requirements. `files` maps relative
 * paths (under .krama/) to their text content, so the bundle can be zipped as-is.
 */
export const ContextPackSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  project: z.object({
    id: z.string(),
    name: z.string(),
    technology: z.string(),
    projectType: z.string(),
    depthMode: DepthModeSchema,
  }),
  approvedTools: z.array(CodingToolSchema),
  checklist: ChecklistFileSchema,
  guardrails: GuardrailRuleSetFileSchema,
  exceptions: GuardrailExceptionsFileSchema,
  files: z.record(z.string(), z.string()),
});
export type ContextPack = z.infer<typeof ContextPackSchema>;

export const CONTEXT_PACK_FILES = {
  agents: "AGENTS.md",
  adr: "ADR.md",
  requirements: "requirements.md",
  guardrails: "guardrails.json",
  exceptions: "exceptions.json",
  checklist: "checklist.json",
  meta: "context-pack.json",
} as const;
