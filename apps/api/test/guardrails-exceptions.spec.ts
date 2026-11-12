import "reflect-metadata";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GUARDRAILS } from "@krama/shared";
import { ExceptionsService } from "../src/exceptions/exceptions.module.js";
import { validateRules } from "../src/guardrails/guardrails.service.js";
import type { AuthUser } from "../src/common/auth-user.js";

const dev: AuthUser = { id: "dev", tenantId: "t1", email: "dev@x", name: "Dev", roles: ["Developer"] };
const now = new Date("2026-11-12T00:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

const activeSet = {
  id: "rs1",
  rules: DEFAULT_GUARDRAILS.rules.map((r) => ({ key: r.id, name: r.name, nonWaivable: r.nonWaivable })),
};

function makeService() {
  const tx = {
    guardrailException: { create: vi.fn(async ({ data }) => ({ id: "ex1", ...data })) },
    approval: { create: vi.fn(async ({ data }) => ({ id: "ap1", ...data })) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const prisma = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const audit = { record: vi.fn(async (_e: unknown, t?: typeof tx) => t?.auditLog.create()) };
  const projects = { getOrThrow: vi.fn(async () => ({ id: "p1", name: "Demo", tenantId: "t1" })) };
  const guardrails = { getActive: vi.fn(async () => activeSet) };
  const svc = new ExceptionsService(prisma as never, audit as never, projects as never, guardrails as never);
  return { svc, tx, audit };
}

describe("ExceptionsService.request", () => {
  let s: ReturnType<typeof makeService>;
  beforeEach(() => {
    s = makeService();
  });

  const base = { projectId: "p1", reason: "Generated migration file is long", scope: "project" as const, paths: [] };

  it("creates a pending exception plus an EXCEPTION approval, and audits", async () => {
    const ex = await s.svc.request(dev, { ...base, ruleId: "max-file-length", expiresAt: inDays(30) }, now);
    expect(ex.status).toBeUndefined(); // DB default PENDING
    expect(s.tx.approval.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subjectType: "EXCEPTION", subjectId: "ex1" }) }),
    );
    expect(s.audit.record).toHaveBeenCalled();
  });

  it("refuses non-waivable rules", async () => {
    await expect(
      s.svc.request(dev, { ...base, ruleId: "no-hardcoded-secrets", expiresAt: inDays(30) }, now),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("validates expiry window and change scope", async () => {
    await expect(s.svc.request(dev, { ...base, ruleId: "max-file-length", expiresAt: inDays(-1) }, now)).rejects.toThrow(/future/);
    await expect(s.svc.request(dev, { ...base, ruleId: "max-file-length", expiresAt: inDays(400) }, now)).rejects.toThrow(/at most/);
    await expect(
      s.svc.request(dev, { ...base, scope: "change", ruleId: "max-file-length", expiresAt: inDays(5) }, now),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("guardrail rule set validation", () => {
  it("accepts the default set", () => {
    expect(() => validateRules(DEFAULT_GUARDRAILS.rules)).not.toThrow();
  });

  it("keeps platform-mandated rules non-waivable and blocking", () => {
    const weakened = DEFAULT_GUARDRAILS.rules.map((r) => (r.id === "no-hardcoded-secrets" ? { ...r, nonWaivable: false } : r));
    expect(() => validateRules(weakened)).toThrow(/platform-mandated/);
    expect(() => validateRules(DEFAULT_GUARDRAILS.rules.filter((r) => r.id !== "no-audit-disable"))).toThrow(/platform-mandated/);
  });

  it("rejects invalid regexes and duplicate ids", () => {
    const bad = [...DEFAULT_GUARDRAILS.rules, { ...DEFAULT_GUARDRAILS.rules[5]!, id: "x", params: { patterns: ["("] } }];
    expect(() => validateRules(bad)).toThrow(/invalid regex/);
    expect(() => validateRules([...DEFAULT_GUARDRAILS.rules, DEFAULT_GUARDRAILS.rules[0]!])).toThrow(/Duplicate/);
  });
});
