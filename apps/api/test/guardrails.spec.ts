import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { CATALOG, canManageVertical } from "@krama/shared";
import { GuardrailsService, type StoredRule } from "../src/guardrails/guardrails.service.js";

const BA = CATALOG.filter((r) => r.vertical === "BA");

function service(published: { vertical: string; version: number; status: string; rules: StoredRule[] }[] = []) {
  const prisma = { guardrailVersion: { findMany: vi.fn(async () => published) } };
  return new GuardrailsService(prisma as never, { record: vi.fn() } as never, {} as never, { CLAMAV_PORT: 3310 } as never);
}

describe("canManageVertical", () => {
  it("lets the Tech Architect manage every vertical", () => {
    for (const v of ["TECHNOLOGY", "BA", "DESIGN", "INFRASTRUCTURE", "TESTING"] as const) expect(canManageVertical(["TechArchitect"], v)).toBe(true);
  });
  it("lets the BA Lead manage only Business Analysis", () => {
    expect(canManageVertical(["BALead"], "BA")).toBe(true);
    expect(canManageVertical(["BALead"], "TECHNOLOGY")).toBe(false);
  });
  it("never lets a Developer or BA manage guardrails", () => {
    expect(canManageVertical(["Developer", "BA"], "BA")).toBe(false);
  });
});

describe("mergeRules", () => {
  const svc = service();
  const input = BA.map((r) => ({ id: r.id, topic: r.topic, title: r.title, text: r.text, level: r.level, sources: r.sources }));

  it("keeps built-in ids and edits text in place", () => {
    const edited = input.map((r, i) => (i === 0 ? { ...r, text: "Each requirement links to an iDhi meeting, MOM, email or document." } : r));
    const out = svc.mergeRules("BA", BA, edited);
    expect(out[0]!.id).toBe(BA[0]!.id);
    expect(out[0]!.text).toContain("email");
    expect(out.filter((r) => r.retired)).toHaveLength(0);
  });

  it("numbers new rules with the vertical prefix", () => {
    const out = svc.mergeRules("BA", BA, [...input, { topic: "ba-requirements", title: "Glossary terms", text: "Every domain term is defined in the glossary.", level: "WARN" }]);
    expect(out.at(-1)?.id).toBe("BA-N01");
    const again = svc.mergeRules("BA", out, [...out.map((r) => ({ ...r, retired: r.retired })), { topic: "ba-requirements", title: "Second new rule", text: "Another rule added in a later edit.", level: "WARN" }]);
    expect(again.at(-1)?.id).toBe("BA-N02");
  });

  it("retires a rule left out of the list instead of deleting it", () => {
    const out = svc.mergeRules("BA", BA, input.slice(1));
    const gone = out.find((r) => r.id === BA[0]!.id);
    expect(gone?.retired).toBe(true);
    expect(out).toHaveLength(BA.length);
  });

  it("refuses duplicate and unknown ids", () => {
    expect(() => svc.mergeRules("BA", BA, [input[0]!, input[0]!])).toThrow(/appears twice/);
    expect(() => svc.mergeRules("BA", BA, [{ ...input[0]!, id: "XYZ-99" }])).toThrow(/not in this draft/);
  });
});

describe("masterRules", () => {
  it("uses the built-in catalogue when nothing is published", async () => {
    const { rules, versions } = await service().masterRules("t");
    expect(rules).toHaveLength(CATALOG.length);
    expect(versions.BA).toBe(1);
  });

  it("replaces a vertical with its published version and drops retired rules", async () => {
    const pub: StoredRule[] = [{ ...(BA[0]!), text: "Changed text for the published version." }, { ...(BA[1]!), retired: true }];
    const { rules, versions } = await service([{ vertical: "BA", version: 3, status: "PUBLISHED", rules: pub }]).masterRules("t");
    const ba = rules.filter((r) => r.vertical === "BA");
    expect(versions.BA).toBe(3);
    expect(ba).toHaveLength(1);
    expect(ba[0]!.text).toBe("Changed text for the published version.");
    expect("retired" in ba[0]!).toBe(false);
    expect(rules.filter((r) => r.vertical === "TECHNOLOGY")).toHaveLength(CATALOG.filter((r) => r.vertical === "TECHNOLOGY").length);
  });
});
