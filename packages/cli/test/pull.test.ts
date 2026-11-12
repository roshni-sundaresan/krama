import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_GUARDRAILS, type ContextPack } from "@krama/shared";
import { branchName, planRun, pull } from "../src/lib.js";

const pack: ContextPack = {
  schemaVersion: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  project: { id: "proj_1", name: "Demo", technology: "typescript-node", projectType: "web-app", depthMode: "governed" },
  approvedTools: ["claude", "codex"],
  checklist: { mode: "governed", items: [{ name: "Git", command: "git", required: true, installHint: "" }] },
  guardrails: DEFAULT_GUARDRAILS,
  exceptions: { exceptions: [] },
  files: {
    "AGENTS.md": "# Rules\n",
    "ADR.md": "# ADR-001\n",
    "requirements.md": "# Requirements\n- REQ-001\n",
  },
};

let server: Server;
let url = "";
let lastAuth: string | undefined;

beforeAll(async () => {
  server = createServer((req, res) => {
    lastAuth = req.headers.authorization;
    if (req.url === "/api/projects/proj_1/context-pack") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(pack));
    } else if (req.url === "/api/projects/evil/context-pack") {
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({ ...pack, files: { "../escape.txt": "x" } }),
      );
    } else {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("krama pull", () => {
  it("writes the context pack into .krama/ using the bearer token", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "krama-pull-"));
    try {
      const written = await pull({ server: url, token: "tok123" }, "proj_1", cwd);
      expect(lastAuth).toBe("Bearer tok123");
      expect(written).toEqual(
        [
          ".krama/ADR.md",
          ".krama/AGENTS.md",
          ".krama/checklist.json",
          ".krama/context-pack.json",
          ".krama/exceptions.json",
          ".krama/guardrails.json",
          ".krama/requirements.md",
        ].map((p) => p.replace(/\//g, sep)),
      );
      const guardrails = JSON.parse(readFileSync(join(cwd, ".krama", "guardrails.json"), "utf8"));
      expect(guardrails.rules.length).toBe(DEFAULT_GUARDRAILS.rules.length);

      // run: approved + installed tool -> plan; unapproved -> error
      const plan = planRun(cwd, "claude", () => "1.0.0");
      expect(plan.command).toBe("claude");
      expect(plan.args.join(" ")).toContain(".krama/AGENTS.md");
      expect(() => planRun(cwd, "copilot", () => "1.0.0")).toThrow(/not on the approved list/);
      expect(() => planRun(cwd, "codex", () => null)).toThrow(/not installed/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("fails on HTTP errors", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "krama-pull-"));
    try {
      await expect(pull({ server: url, token: "t" }, "missing", cwd)).rejects.toThrow(/HTTP 404/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("refuses path traversal in pack files", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "krama-pull-"));
    try {
      await expect(pull({ server: url, token: "t" }, "evil", cwd)).rejects.toThrow(/outside/);
      expect(existsSync(join(cwd, "escape.txt"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("krama push", () => {
  it("names branches krama-gen-<timestamp>", () => {
    expect(branchName(new Date("2026-03-04T05:06:07Z"))).toBe("krama-gen-20260304050607");
  });
});
