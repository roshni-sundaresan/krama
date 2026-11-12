import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChecklistFile } from "@krama/shared";
import { compareVersions, evaluateChecklist, formatCheck, loadChecklist, parseVersion } from "../src/lib.js";

const checklist: ChecklistFile = {
  mode: "guided",
  items: [
    { name: "Git", command: "git", minVersion: "2.40.0", required: true, installHint: "install git" },
    { name: "Node", command: "node", minVersion: "22.12.0", required: true, installHint: "install node" },
    { name: "Docker", command: "docker", required: false, installHint: "install docker" },
  ],
};

const probe = (versions: Record<string, string>) => (cmd: string) => versions[cmd] ?? null;

const tmp: string[] = [];
afterEach(() => tmp.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("version helpers", () => {
  it("parses and compares", () => {
    expect(parseVersion("git version 2.43.0")).toBe("2.43.0");
    expect(parseVersion("v22.1")).toBe("22.1.0");
    expect(parseVersion("nope")).toBeNull();
    expect(compareVersions("2.43.0", "2.40.0")).toBeGreaterThan(0);
    expect(compareVersions("22.11.9", "22.12.0")).toBeLessThan(0);
  });
});

describe("krama check", () => {
  it("reports met / missing / outdated", () => {
    const out = evaluateChecklist(checklist, { probe: probe({ git: "git version 2.43.0", node: "v20.1.0" }) });
    expect(out.results.map((r) => r.status)).toEqual(["met", "outdated", "missing"]);
    expect(out.blocked).toBe(false); // guided only warns
    expect(formatCheck(out, "test")).toContain("install: install node");
  });

  it("blocks in governed mode when a required item is unmet", () => {
    const out = evaluateChecklist(checklist, { mode: "governed", probe: probe({ git: "git version 2.43.0" }) });
    expect(out.blocked).toBe(true);
  });

  it("does not block in governed mode when only optional items are missing", () => {
    const out = evaluateChecklist(checklist, {
      mode: "governed",
      probe: probe({ git: "git version 2.43.0", node: "v22.12.0" }),
    });
    expect(out.blocked).toBe(false);
  });

  it("loads the checklist from .krama/checklist.json, else falls back to default", () => {
    const cwd = mkdtempSync(join(tmpdir(), "krama-cli-"));
    tmp.push(cwd);
    expect(loadChecklist(cwd).source).toBe("built-in default");
    mkdirSync(join(cwd, ".krama"));
    writeFileSync(join(cwd, ".krama", "checklist.json"), JSON.stringify({ ...checklist, mode: "governed" }));
    const loaded = loadChecklist(cwd);
    expect(loaded.checklist.mode).toBe("governed");
    expect(loaded.checklist.items).toHaveLength(3);
  });

  it("accepts a blueprint that wraps the checklist", () => {
    const cwd = mkdtempSync(join(tmpdir(), "krama-cli-"));
    tmp.push(cwd);
    const bp = join(cwd, "blueprint.json");
    writeFileSync(bp, JSON.stringify({ name: "node-api", checklist }));
    expect(loadChecklist(cwd, bp).checklist.items[0]!.command).toBe("git");
    expect(() => loadChecklist(cwd, join(cwd, "missing.json"))).toThrow(/not found/);
  });
});
