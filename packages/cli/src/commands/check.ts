import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ChecklistFileSchema, type ChecklistFile, type ChecklistItem, type DepthMode } from "@krama/shared";
import { KRAMA_DIR } from "../config.js";
import { defaultProbe, type VersionProbe } from "../exec.js";
import { compareVersions, parseVersion } from "../version.js";

export interface CheckItemResult {
  item: ChecklistItem;
  status: "met" | "missing" | "outdated";
  foundVersion: string | null;
}

export interface CheckOutcome {
  mode: DepthMode;
  results: CheckItemResult[];
  /** True when the command should exit non-zero. Only governed mode blocks. */
  blocked: boolean;
}

/** Fallback checklist when no context pack or blueprint is present. */
export const DEFAULT_CHECKLIST: ChecklistFile = {
  mode: "guided",
  items: [
    { name: "Git", command: "git", minVersion: "2.40.0", required: true, installHint: "https://git-scm.com/downloads" },
    { name: "Node.js", command: "node", minVersion: "22.12.0", required: true, installHint: "https://nodejs.org (LTS)" },
  ],
};

/** Resolve the checklist: explicit blueprint file > .krama/checklist.json > default. */
export function loadChecklist(cwd: string, blueprint?: string): { checklist: ChecklistFile; source: string } {
  const candidates = blueprint ? [blueprint] : [join(cwd, KRAMA_DIR, "checklist.json")];
  for (const p of candidates) {
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, "utf8")) as unknown;
      // A blueprint may wrap the checklist: { "checklist": { ... } }
      const body = raw && typeof raw === "object" && "checklist" in raw ? (raw as { checklist: unknown }).checklist : raw;
      return { checklist: ChecklistFileSchema.parse(body), source: p };
    }
    if (blueprint) throw new Error(`Blueprint file not found: ${blueprint}`);
  }
  return { checklist: DEFAULT_CHECKLIST, source: "built-in default" };
}

export function evaluateChecklist(
  checklist: ChecklistFile,
  opts: { mode?: DepthMode; probe?: VersionProbe } = {},
): CheckOutcome {
  const probe = opts.probe ?? defaultProbe;
  const mode = opts.mode ?? checklist.mode;
  const results: CheckItemResult[] = checklist.items.map((item) => {
    const out = probe(item.command);
    if (out === null) return { item, status: "missing", foundVersion: null };
    const found = parseVersion(out);
    if (item.minVersion && found && compareVersions(found, item.minVersion) < 0) {
      return { item, status: "outdated", foundVersion: found };
    }
    return { item, status: "met", foundVersion: found };
  });
  const unmetRequired = results.some((r) => r.item.required && r.status !== "met");
  return { mode, results, blocked: mode === "governed" && unmetRequired };
}

export function formatCheck(outcome: CheckOutcome, source: string): string {
  const lines = [`Krama prerequisite check — mode: ${outcome.mode} — checklist: ${source}`, ""];
  for (const r of outcome.results) {
    const tag = r.status === "met" ? "MET    " : r.status === "missing" ? "MISSING" : "OUTDATED";
    const ver = r.foundVersion ? ` ${r.foundVersion}` : "";
    const need = r.item.minVersion ? ` (need >= ${r.item.minVersion})` : "";
    lines.push(`[${tag}] ${r.item.name}${ver}${need}${r.item.required ? "" : " [optional]"}`);
    if (r.status !== "met" && r.item.installHint) lines.push(`          install: ${r.item.installHint}`);
  }
  const unmet = outcome.results.filter((r) => r.item.required && r.status !== "met").length;
  lines.push("");
  if (unmet === 0) lines.push("All required software is present.");
  else if (outcome.blocked) lines.push(`BLOCKED: ${unmet} required item(s) unmet (governed mode).`);
  else lines.push(`WARNING: ${unmet} required item(s) unmet. Governed mode would block.`);
  return lines.join("\n");
}
