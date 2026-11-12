import { describe, expect, it } from "vitest";
import {
  DEFAULT_GUARDRAILS,
  DocumentStatementSchema,
  GuardrailRuleSetFileSchema,
  RequestExceptionSchema,
  hasAnyRole,
  isReadOnly,
} from "../src/index.js";

describe("roles", () => {
  it("treats Admin as all-powerful", () => {
    expect(hasAnyRole(["Admin"], ["LeadArchitect"])).toBe(true);
  });
  it("detects read-only challenger", () => {
    expect(isReadOnly(["Challenger"])).toBe(true);
    expect(isReadOnly(["Challenger", "BA"])).toBe(false);
  });
});

describe("guardrail schemas", () => {
  it("default guardrails are valid and mark secrets non-waivable", () => {
    const parsed = GuardrailRuleSetFileSchema.parse(DEFAULT_GUARDRAILS);
    const secrets = parsed.rules.find((r) => r.id === "no-hardcoded-secrets");
    expect(secrets?.nonWaivable).toBe(true);
    expect(secrets?.level).toBe("BLOCK");
  });

  it("rejects unknown rule types", () => {
    const bad = { ...DEFAULT_GUARDRAILS, rules: [{ ...DEFAULT_GUARDRAILS.rules[0], type: "nope" }] };
    expect(GuardrailRuleSetFileSchema.safeParse(bad).success).toBe(false);
  });

  it("requires an ISO expiry on exception requests", () => {
    const base = { projectId: "p1", ruleId: "max-file-length", reason: "Generated file, refactor later", scope: "project" };
    expect(RequestExceptionSchema.safeParse({ ...base, expiresAt: "tomorrow" }).success).toBe(false);
    expect(RequestExceptionSchema.safeParse({ ...base, expiresAt: "2030-01-01T00:00:00Z" }).success).toBe(true);
  });
});

describe("document statements", () => {
  it("defaults citations to empty", () => {
    const s = DocumentStatementSchema.parse({ text: "x", aiSuggested: true });
    expect(s.citations).toEqual([]);
  });
});
