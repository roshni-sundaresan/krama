import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CodingToolSchema, type CodingTool } from "@krama/shared";
import { KRAMA_DIR } from "../config.js";
import { defaultProbe, exec, type VersionProbe } from "../exec.js";

export const TOOL_PROMPT = [
  "You are generating code inside a Krama-governed repository.",
  `1. Read ${KRAMA_DIR}/AGENTS.md first; its rules are mandatory.`,
  `2. Implement ONLY the approved requirements in ${KRAMA_DIR}/requirements.md, following ${KRAMA_DIR}/ADR.md.`,
  `3. Respect ${KRAMA_DIR}/guardrails.json: no hardcoded secrets, keep files/functions short, add tests under tests/.`,
  "4. Reference requirement codes (e.g. REQ-001) in code comments and test names where relevant.",
  `5. Do not modify anything under ${KRAMA_DIR}/.`,
].join("\n");

/**
 * How each approved tool is launched non-interactively.
 * TODO: confirm flags against the versions approved by the Lead Architect.
 */
export function toolInvocation(tool: CodingTool, prompt: string): { command: string; args: string[] } {
  switch (tool) {
    case "claude":
      return { command: "claude", args: ["-p", prompt, "--permission-mode", "acceptEdits"] };
    case "copilot":
      return { command: "copilot", args: ["-p", prompt] };
    case "codex":
      return { command: "codex", args: ["exec", prompt] };
  }
}

export interface RunPlan {
  tool: CodingTool;
  command: string;
  args: string[];
}

/** Validate that the tool is approved (context pack) and installed, and build the invocation. */
export function planRun(cwd: string, toolName: string, probe: VersionProbe = defaultProbe): RunPlan {
  const tool = CodingToolSchema.parse(toolName);
  const metaPath = join(cwd, KRAMA_DIR, "context-pack.json");
  if (!existsSync(metaPath)) throw new Error(`No context pack found. Run: krama pull <projectId>`);
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { approvedTools?: string[] };
  if (!meta.approvedTools?.includes(tool)) {
    throw new Error(`Tool "${tool}" is not on the approved list (${(meta.approvedTools ?? []).join(", ") || "none"}).`);
  }
  if (!existsSync(join(cwd, KRAMA_DIR, "AGENTS.md"))) throw new Error(`${KRAMA_DIR}/AGENTS.md missing; re-run krama pull.`);
  const inv = toolInvocation(tool, TOOL_PROMPT);
  if (probe(inv.command) === null) {
    throw new Error(`"${inv.command}" is not installed or not on PATH. Run: krama check`);
  }
  return { tool, ...inv };
}

export function executeRun(plan: RunPlan, cwd: string): number {
  const r = exec(plan.command, plan.args, { cwd, inherit: true });
  return r.status ?? 1;
}
