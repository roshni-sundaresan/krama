import { z } from "zod";

export const DEPTH_MODES = ["skeleton", "guided", "governed"] as const;
export const DepthModeSchema = z.enum(DEPTH_MODES);
export type DepthMode = z.infer<typeof DepthModeSchema>;

export const RuleLevelSchema = z.enum(["BLOCK", "WARN"]);
export type RuleLevel = z.infer<typeof RuleLevelSchema>;

export const RULE_TYPES = [
  "no-secrets",
  "max-file-length",
  "max-function-length",
  "prohibited-pattern",
  "require-tests-dir",
] as const;
export const RuleTypeSchema = z.enum(RULE_TYPES);
export type RuleType = z.infer<typeof RuleTypeSchema>;

export const GuardrailRuleSchema = z.object({
  /** Stable rule key, e.g. "no-hardcoded-secrets". Exceptions reference this. */
  id: z.string().min(1),
  name: z.string().min(1),
  type: RuleTypeSchema,
  level: RuleLevelSchema,
  /** Non-waivable rules can never be excepted (secrets, unapproved AI providers, disabling audit). */
  nonWaivable: z.boolean().default(false),
  /** Glob patterns of files the rule applies to. Empty = all files. */
  appliesTo: z.array(z.string()).default([]),
  description: z.string().optional(),
  /**
   * Type-specific parameters:
   * - max-file-length: { maxLines: number }
   * - max-function-length: { maxLines: number }
   * - prohibited-pattern: { patterns: string[] (regex), message?: string }
   * - require-tests-dir: { dirs: string[] }  (any one must exist)
   * - no-secrets: { extraPatterns?: string[] }
   */
  params: z.record(z.string(), z.unknown()).default({}),
});
export type GuardrailRule = z.infer<typeof GuardrailRuleSchema>;

/** guardrails.json — what the checker consumes. */
export const GuardrailRuleSetFileSchema = z.object({
  ruleSetId: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  rules: z.array(GuardrailRuleSchema),
});
export type GuardrailRuleSetFile = z.infer<typeof GuardrailRuleSetFileSchema>;

export const ExceptionScopeSchema = z.enum(["project", "change"]);
export const ExceptionStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const GuardrailExceptionSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  reason: z.string(),
  scope: ExceptionScopeSchema,
  status: ExceptionStatusSchema,
  /** ISO timestamp; exception is ignored after this instant. */
  expiresAt: z.string(),
  /** For scope=change: branch / PR ref the exception is limited to. */
  changeRef: z.string().optional(),
  /** Optional path globs the exception is limited to. Empty = whole repo. */
  paths: z.array(z.string()).default([]),
  approvedBy: z.string().optional(),
});
export type GuardrailException = z.infer<typeof GuardrailExceptionSchema>;

/** exceptions.json */
export const GuardrailExceptionsFileSchema = z.object({
  exceptions: z.array(GuardrailExceptionSchema),
});
export type GuardrailExceptionsFile = z.infer<typeof GuardrailExceptionsFileSchema>;

/** Default team guardrail set used by the seed script and as a fallback. */
export const DEFAULT_GUARDRAILS: GuardrailRuleSetFile = {
  ruleSetId: "default",
  name: "Idealake default guardrails",
  version: 1,
  rules: [
    {
      id: "no-hardcoded-secrets",
      name: "No hardcoded secrets",
      type: "no-secrets",
      level: "BLOCK",
      nonWaivable: true,
      appliesTo: [],
      params: {},
    },
    {
      id: "no-unapproved-ai-providers",
      name: "No unapproved AI providers",
      type: "prohibited-pattern",
      level: "BLOCK",
      nonWaivable: true,
      appliesTo: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.py", "**/package.json", "**/requirements*.txt", "**/pyproject.toml"],
      params: {
        patterns: ["api\\.openai\\.com", "generativelanguage\\.googleapis\\.com", "\"openai\"\\s*:", "^openai[=<>~ ]"],
        message: "Only the Krama model gateway (Claude on Bedrock ap-south-1) is approved.",
      },
    },
    {
      id: "no-audit-disable",
      name: "Audit logging must not be disabled",
      type: "prohibited-pattern",
      level: "BLOCK",
      nonWaivable: true,
      appliesTo: [],
      params: { patterns: ["KRAMA_AUDIT_DISABLE[D]", "disableAudit\\s*[:=]\\s*true"] },
    },
    {
      id: "max-file-length",
      name: "Max file length 400 lines",
      type: "max-file-length",
      level: "WARN",
      nonWaivable: false,
      appliesTo: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.py", "**/*.java", "**/*.cs"],
      params: { maxLines: 400 },
    },
    {
      id: "max-function-length",
      name: "Max function length 60 lines",
      type: "max-function-length",
      level: "WARN",
      nonWaivable: false,
      appliesTo: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.py"],
      params: { maxLines: 60 },
    },
    {
      id: "no-console-log",
      name: "No console.log in source",
      type: "prohibited-pattern",
      level: "WARN",
      nonWaivable: false,
      appliesTo: ["src/**/*.ts", "src/**/*.tsx"],
      params: { patterns: ["console\\.log\\("] },
    },
    {
      id: "tests-required",
      name: "Tests directory present",
      type: "require-tests-dir",
      level: "BLOCK",
      nonWaivable: false,
      appliesTo: [],
      params: { dirs: ["test", "tests", "__tests__", "src/__tests__"] },
    },
  ],
};
