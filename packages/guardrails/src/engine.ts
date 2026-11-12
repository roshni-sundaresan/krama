import type {
  DepthMode,
  GuardrailException,
  GuardrailRule,
  GuardrailRuleSetFile,
  RuleLevel,
} from "@krama/shared";
import { collectFiles, matchesAny } from "./files.js";
import { RULE_EVALUATORS, type Finding } from "./rules.js";

export type RuleStatus = "pass" | "fail" | "excepted";

export interface RuleResult {
  ruleId: string;
  name: string;
  configuredLevel: RuleLevel;
  /** Level after applying depth mode (governed turns WARN into BLOCK). */
  effectiveLevel: RuleLevel;
  nonWaivable: boolean;
  status: RuleStatus;
  /** Findings that still count against the rule. */
  findings: Finding[];
  /** Findings suppressed by an approved exception. */
  exceptedFindings: Finding[];
  exceptionIds: string[];
  blocking: boolean;
}

export interface CheckReport {
  mode: DepthMode;
  ruleSet: { id: string; name: string; version: number };
  filesScanned: number;
  results: RuleResult[];
  blockingFailures: number;
  warnings: number;
  passed: boolean;
  /** Exceptions that were ignored and why (expired, non-waivable rule, ...). */
  ignoredExceptions: { id: string; ruleId: string; reason: string }[];
}

export interface CheckOptions {
  root: string;
  ruleSet: GuardrailRuleSetFile;
  exceptions?: GuardrailException[];
  mode: DepthMode;
  /** Branch / PR ref of the change being checked; enables scope=change exceptions. */
  changeRef?: string;
  now?: Date;
}

export function effectiveLevel(level: RuleLevel, mode: DepthMode): RuleLevel {
  return mode === "governed" ? "BLOCK" : level;
}

/** Decide which exceptions are usable for a rule; returns usable ones and reasons for the rest. */
export function applicableExceptions(
  rule: GuardrailRule,
  exceptions: GuardrailException[],
  opts: { now: Date; changeRef?: string },
): { usable: GuardrailException[]; ignored: { id: string; ruleId: string; reason: string }[] } {
  const usable: GuardrailException[] = [];
  const ignored: { id: string; ruleId: string; reason: string }[] = [];
  for (const ex of exceptions.filter((e) => e.ruleId === rule.id)) {
    const why =
      rule.nonWaivable
        ? "rule is non-waivable"
        : ex.status !== "APPROVED"
          ? `status is ${ex.status}`
          : Number.isNaN(Date.parse(ex.expiresAt)) || Date.parse(ex.expiresAt) <= opts.now.getTime()
            ? "expired"
            : ex.scope === "change" && (!opts.changeRef || ex.changeRef !== opts.changeRef)
              ? "change-scoped exception does not match this change"
              : null;
    if (why) ignored.push({ id: ex.id, ruleId: ex.ruleId, reason: why });
    else usable.push(ex);
  }
  return { usable, ignored };
}

function isCovered(finding: Finding, ex: GuardrailException): boolean {
  if (ex.paths.length === 0) return true;
  return finding.file !== null && matchesAny(ex.paths, finding.file);
}

export function runCheck(opts: CheckOptions): CheckReport {
  const now = opts.now ?? new Date();
  const files = collectFiles(opts.root);
  const ctx = { root: opts.root, files };
  const exceptions = opts.exceptions ?? [];
  const ignoredExceptions: CheckReport["ignoredExceptions"] = [];

  const results: RuleResult[] = opts.ruleSet.rules.map((rule) => {
    const raw = RULE_EVALUATORS[rule.type](rule, ctx);
    const { usable, ignored } = applicableExceptions(rule, exceptions, { now, changeRef: opts.changeRef });
    ignoredExceptions.push(...ignored);

    const findings: Finding[] = [];
    const exceptedFindings: Finding[] = [];
    const usedIds = new Set<string>();
    for (const f of raw) {
      const ex = usable.find((e) => isCovered(f, e));
      if (ex) {
        exceptedFindings.push(f);
        usedIds.add(ex.id);
      } else findings.push(f);
    }

    const level = effectiveLevel(rule.level, opts.mode);
    const status: RuleStatus = findings.length > 0 ? "fail" : exceptedFindings.length > 0 ? "excepted" : "pass";
    return {
      ruleId: rule.id,
      name: rule.name,
      configuredLevel: rule.level,
      effectiveLevel: level,
      nonWaivable: rule.nonWaivable,
      status,
      findings,
      exceptedFindings,
      exceptionIds: [...usedIds],
      blocking: status === "fail" && level === "BLOCK",
    };
  });

  const blockingFailures = results.filter((r) => r.blocking).length;
  return {
    mode: opts.mode,
    ruleSet: { id: opts.ruleSet.ruleSetId, name: opts.ruleSet.name, version: opts.ruleSet.version },
    filesScanned: files.length,
    results,
    blockingFailures,
    warnings: results.filter((r) => r.status === "fail" && !r.blocking).length,
    passed: blockingFailures === 0,
    ignoredExceptions,
  };
}

export function formatReport(report: CheckReport): string {
  const out: string[] = [];
  out.push(
    `Krama guardrails — rule set "${report.ruleSet.name}" v${report.ruleSet.version} — mode: ${report.mode} — ${report.filesScanned} files scanned`,
    "",
  );
  for (const r of report.results) {
    const tag = r.status === "pass" ? "PASS" : r.status === "excepted" ? "EXCEPTED" : r.blocking ? "FAIL" : "WARN";
    const level =
      r.configuredLevel === r.effectiveLevel ? r.effectiveLevel : `${r.configuredLevel}→${r.effectiveLevel}`;
    out.push(`[${tag}] ${r.ruleId} — ${r.name} (${level}${r.nonWaivable ? ", non-waivable" : ""})`);
    for (const f of r.findings.slice(0, 20)) {
      out.push(`    ${f.file ?? "<repo>"}${f.line ? `:${f.line}` : ""}  ${f.message}`);
    }
    if (r.findings.length > 20) out.push(`    … ${r.findings.length - 20} more`);
    if (r.exceptionIds.length) out.push(`    excepted by: ${r.exceptionIds.join(", ")}`);
  }
  for (const i of report.ignoredExceptions) out.push(`(ignored exception ${i.id} for ${i.ruleId}: ${i.reason})`);
  out.push(
    "",
    report.passed
      ? `Result: PASSED (${report.warnings} warning(s))`
      : `Result: FAILED — ${report.blockingFailures} blocking rule(s), ${report.warnings} warning(s)`,
  );
  return out.join("\n");
}
