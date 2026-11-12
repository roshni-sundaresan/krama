import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GUARDRAILS, type GuardrailException, type GuardrailRuleSetFile } from "@krama/shared";
import { functionLengths, matchGlob, runCheck } from "../src/index.js";

// Secret-looking fixtures are assembled at runtime so this file never contains a literal secret.
const FAKE_AWS_KEY = "AKIA" + "ABCDEFGHIJKLMNOP";
const FAKE_PASSWORD_LINE = `const password = "${"hunter2" + "-super-secret"}";`;

const dirs: string[] = [];
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "krama-gr-"));
  dirs.push(root);
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), content);
  }
  return root;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

function ex(partial: Partial<GuardrailException> & Pick<GuardrailException, "ruleId">): GuardrailException {
  return { id: "ex1", reason: "legacy code", scope: "project", status: "APPROVED", expiresAt: future, paths: [], ...partial };
}

const longFile = Array.from({ length: 450 }, (_, i) => `export const v${i} = ${i};`).join("\n");

describe("glob", () => {
  it("matches ** and basename patterns", () => {
    expect(matchGlob("**/*.ts", "src/a/b.ts")).toBe(true);
    expect(matchGlob("**/*.ts", "b.ts")).toBe(true);
    expect(matchGlob("src/**/*.ts", "lib/b.ts")).toBe(false);
    expect(matchGlob("*.py", "pkg/mod.py")).toBe(true);
  });
});

describe("runCheck", () => {
  it("passes a clean repo with tests", () => {
    const root = repo({ "src/index.ts": "export const a = 1;\n", "test/a.test.ts": "it('x', () => {});\n" });
    const report = runCheck({ root, ruleSet: DEFAULT_GUARDRAILS, mode: "guided" });
    expect(report.passed).toBe(true);
    expect(report.results.every((r) => r.status === "pass")).toBe(true);
  });

  it("blocks hardcoded secrets", () => {
    const root = repo({ "src/cfg.ts": `export const k = "${FAKE_AWS_KEY}";\n${FAKE_PASSWORD_LINE}\n`, "tests/x.txt": "" });
    const report = runCheck({ root, ruleSet: DEFAULT_GUARDRAILS, mode: "skeleton" });
    const r = report.results.find((x) => x.ruleId === "no-hardcoded-secrets")!;
    expect(r.status).toBe("fail");
    expect(r.findings).toHaveLength(2);
    expect(report.passed).toBe(false);
  });

  it("does not flag env lookups", () => {
    const root = repo({ "src/cfg.ts": "const password = process.env.DB_PASSWORD;\n", "test/.keep": "" });
    const report = runCheck({ root, ruleSet: DEFAULT_GUARDRAILS, mode: "guided" });
    expect(report.results.find((x) => x.ruleId === "no-hardcoded-secrets")!.status).toBe("pass");
  });

  it("requires a tests directory", () => {
    const root = repo({ "src/index.ts": "export {};\n" });
    const report = runCheck({ root, ruleSet: DEFAULT_GUARDRAILS, mode: "guided" });
    expect(report.results.find((x) => x.ruleId === "tests-required")!.blocking).toBe(true);
  });

  it("WARN rules warn in guided mode but block in governed mode", () => {
    const root = repo({ "src/big.ts": longFile, "test/.keep": "" });
    const guided = runCheck({ root, ruleSet: DEFAULT_GUARDRAILS, mode: "guided" });
    expect(guided.passed).toBe(true);
    expect(guided.warnings).toBe(1);
    const governed = runCheck({ root, ruleSet: DEFAULT_GUARDRAILS, mode: "governed" });
    expect(governed.passed).toBe(false);
    expect(governed.results.find((r) => r.ruleId === "max-file-length")!.effectiveLevel).toBe("BLOCK");
  });

  it("honours approved, unexpired exceptions", () => {
    const root = repo({ "src/big.ts": longFile, "test/.keep": "" });
    const report = runCheck({
      root,
      ruleSet: DEFAULT_GUARDRAILS,
      mode: "governed",
      exceptions: [ex({ ruleId: "max-file-length" })],
    });
    const r = report.results.find((x) => x.ruleId === "max-file-length")!;
    expect(r.status).toBe("excepted");
    expect(report.passed).toBe(true);
  });

  it("ignores expired, pending and path-mismatched exceptions", () => {
    const root = repo({ "src/big.ts": longFile, "test/.keep": "" });
    const report = runCheck({
      root,
      ruleSet: DEFAULT_GUARDRAILS,
      mode: "governed",
      exceptions: [
        ex({ id: "expired", ruleId: "max-file-length", expiresAt: past }),
        ex({ id: "pending", ruleId: "max-file-length", status: "PENDING" }),
        ex({ id: "other-path", ruleId: "max-file-length", paths: ["lib/**"] }),
      ],
    });
    expect(report.passed).toBe(false);
    expect(report.ignoredExceptions.map((i) => i.id).sort()).toEqual(["expired", "pending"]);
  });

  it("never honours exceptions for non-waivable rules", () => {
    const root = repo({ "src/cfg.ts": `export const k = "${FAKE_AWS_KEY}";\n`, "test/.keep": "" });
    const report = runCheck({
      root,
      ruleSet: DEFAULT_GUARDRAILS,
      mode: "skeleton",
      exceptions: [ex({ ruleId: "no-hardcoded-secrets" })],
    });
    expect(report.passed).toBe(false);
    expect(report.ignoredExceptions[0]!.reason).toMatch(/non-waivable/);
  });

  it("change-scoped exceptions only apply to the matching change", () => {
    const root = repo({ "src/big.ts": longFile, "test/.keep": "" });
    const exceptions = [ex({ ruleId: "max-file-length", scope: "change", changeRef: "krama-gen-1" })];
    expect(runCheck({ root, ruleSet: DEFAULT_GUARDRAILS, mode: "governed", exceptions }).passed).toBe(false);
    expect(
      runCheck({ root, ruleSet: DEFAULT_GUARDRAILS, mode: "governed", exceptions, changeRef: "krama-gen-1" }).passed,
    ).toBe(true);
  });

  it("supports configurable prohibited patterns", () => {
    const ruleSet: GuardrailRuleSetFile = {
      ruleSetId: "t",
      name: "t",
      version: 1,
      rules: [
        {
          id: "no-eval",
          name: "No eval",
          type: "prohibited-pattern",
          level: "BLOCK",
          nonWaivable: false,
          appliesTo: ["**/*.js"],
          params: { patterns: ["\\beval\\("] },
        },
      ],
    };
    const root = repo({ "a.js": "eval('1');\n", "b.ts": "eval('1');\n" });
    const r = runCheck({ root, ruleSet, mode: "guided" }).results[0]!;
    expect(r.findings).toEqual([expect.objectContaining({ file: "a.js", line: 1 })]);
  });
});

describe("function length heuristic", () => {
  it("measures brace and python functions", () => {
    const ts = ["function a() {", "  if (x) {", "  }", "}", "const b = () => {", "};"];
    expect(functionLengths({ path: "a.ts", content: "", lines: ts })).toEqual([
      { line: 1, length: 4 },
      { line: 5, length: 2 },
    ]);
    const py = ["def a():", "    x = 1", "", "    return x", "def b():", "    pass"];
    expect(functionLengths({ path: "a.py", content: "", lines: py })).toEqual([
      { line: 1, length: 4 },
      { line: 5, length: 2 },
    ]);
  });
});
