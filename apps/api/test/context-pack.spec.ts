import { describe, expect, it } from "vitest";
import { ContextPackSchema, DEFAULT_GUARDRAILS } from "@krama/shared";
import { buildContextPack } from "../src/context-pack/context-pack.builder.js";

const input = {
  project: { id: "p1", name: "Leave Tracker", technology: "typescript-node", projectType: "web-app", depthMode: "governed" as const, approvedTools: ["claude", "notatool"], clientWork: false },
  requirements: [
    { code: "REQ-001", title: "Apply", description: "Employees must apply for leave.", type: "FUNCTIONAL", priority: "MUST", citations: [{ sourceItemId: "src1", quote: "must apply", location: "line 1" }] },
  ],
  decisions: [],
  guardrails: DEFAULT_GUARDRAILS,
  exceptions: { exceptions: [] },
  now: new Date("2026-11-12T00:00:00Z"),
};

describe("context pack builder", () => {
  it("produces a schema-valid pack with rules pack, requirements and ADR", () => {
    const pack = ContextPackSchema.parse(buildContextPack(input));
    expect(pack.approvedTools).toEqual(["claude"]);
    expect(Object.keys(pack.files).sort()).toEqual(["ADR.md", "AGENTS.md", "requirements.md"]);
    expect(pack.files["requirements.md"]).toContain("REQ-001");
    expect(pack.files["requirements.md"]).toContain('`src1` (line 1): "must apply"');
    expect(pack.files["ADR.md"]).toContain("ADR-001");
  });

  it("renders governed mode: WARN rules shown as BLOCK", () => {
    const agents = buildContextPack(input).files["AGENTS.md"]!;
    expect(agents).toContain("**max-file-length** — Max file length 400 lines (BLOCK)");
    expect(agents).toContain("non-waivable");
  });

  it("builds the checklist from technology and approved tools", () => {
    const pack = buildContextPack(input);
    expect(pack.checklist.mode).toBe("governed");
    expect(pack.checklist.items.map((i) => i.command)).toEqual(["git", "node", "pnpm", "claude"]);
  });
});
