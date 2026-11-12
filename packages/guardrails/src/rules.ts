import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { GuardrailRule } from "@krama/shared";
import { matchesAny, type SourceFile } from "./files.js";

export interface Finding {
  /** Null for repo-level findings (e.g. missing tests dir). */
  file: string | null;
  line?: number;
  message: string;
}

export interface RuleContext {
  root: string;
  files: SourceFile[];
}

export type RuleEvaluator = (rule: GuardrailRule, ctx: RuleContext) => Finding[];

/** Built-in secret patterns. Deliberately conservative to keep false positives low. */
export const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "generic sk- API key", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: "JSON web token", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    name: "hardcoded credential assignment",
    re: /\b(?:password|passwd|pwd|secret|client[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  },
  {
    name: "credentials in connection string",
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]{6,}@[^\s]+/i,
  },
];

function filesFor(rule: GuardrailRule, ctx: RuleContext): SourceFile[] {
  return ctx.files.filter((f) => matchesAny(rule.appliesTo, f.path));
}

function compile(patterns: unknown): RegExp[] {
  if (!Array.isArray(patterns)) return [];
  return patterns.filter((p): p is string => typeof p === "string").map((p) => new RegExp(p, "i"));
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

const noSecrets: RuleEvaluator = (rule, ctx) => {
  const extra = compile(rule.params["extraPatterns"]).map((re) => ({ name: "custom secret pattern", re }));
  const patterns = [...SECRET_PATTERNS, ...extra];
  const findings: Finding[] = [];
  for (const f of filesFor(rule, ctx)) {
    f.lines.forEach((line, i) => {
      for (const p of patterns) {
        if (p.re.test(line)) {
          findings.push({ file: f.path, line: i + 1, message: `Possible ${p.name}` });
          break;
        }
      }
    });
  }
  return findings;
};

const maxFileLength: RuleEvaluator = (rule, ctx) => {
  const max = num(rule.params["maxLines"], 400);
  return filesFor(rule, ctx)
    .filter((f) => f.lines.length > max)
    .map((f) => ({ file: f.path, message: `${f.lines.length} lines exceeds max ${max}` }));
};

const BRACE_FN_START =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\b|(?:public|private|protected|static|readonly|async|\s)*[A-Za-z_$][\w$]*\s*\([^;]*\)\s*(?::[^={]+)?\{|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>\s*\{)/;
const CONTROL_KEYWORDS = /^\s*(?:if|for|while|switch|catch|with|return|else)\b/;

/** Heuristic function length: brace matching for C-like languages, indentation for Python. */
export function functionLengths(file: SourceFile): { line: number; length: number }[] {
  return file.path.endsWith(".py") ? pythonFunctions(file.lines) : braceFunctions(file.lines);
}

function braceFunctions(lines: string[]): { line: number; length: number }[] {
  const result: { line: number; length: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (CONTROL_KEYWORDS.test(line) || !BRACE_FN_START.test(line)) continue;
    let depth = 0;
    let opened = false;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]!) {
        if (ch === "{") {
          depth++;
          opened = true;
        } else if (ch === "}") depth--;
      }
      if (opened && depth <= 0) {
        result.push({ line: i + 1, length: j - i + 1 });
        break;
      }
    }
  }
  return result;
}

function pythonFunctions(lines: string[]): { line: number; length: number }[] {
  const result: { line: number; length: number }[] = [];
  const indentOf = (s: string) => s.length - s.trimStart().length;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:async\s+)?def\s+\w+/.exec(lines[i]!);
    if (!m) continue;
    const base = m[1]!.length;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (l.trim() === "") continue;
      if (indentOf(l) <= base) break;
      end = j;
    }
    result.push({ line: i + 1, length: end - i + 1 });
  }
  return result;
}

const maxFunctionLength: RuleEvaluator = (rule, ctx) => {
  const max = num(rule.params["maxLines"], 60);
  const findings: Finding[] = [];
  for (const f of filesFor(rule, ctx)) {
    for (const fn of functionLengths(f)) {
      if (fn.length > max) {
        findings.push({ file: f.path, line: fn.line, message: `function is ${fn.length} lines (max ${max})` });
      }
    }
  }
  return findings;
};

const prohibitedPattern: RuleEvaluator = (rule, ctx) => {
  const patterns = compile(rule.params["patterns"]);
  const message = typeof rule.params["message"] === "string" ? rule.params["message"] : "prohibited pattern";
  const findings: Finding[] = [];
  for (const f of filesFor(rule, ctx)) {
    f.lines.forEach((line, i) => {
      const hit = patterns.find((re) => re.test(line));
      if (hit) findings.push({ file: f.path, line: i + 1, message: `${message} (/${hit.source}/)` });
    });
  }
  return findings;
};

const requireTestsDir: RuleEvaluator = (rule, ctx) => {
  const raw = rule.params["dirs"];
  const dirs = Array.isArray(raw) && raw.length > 0 ? raw.map(String) : ["test", "tests"];
  const present = dirs.some((d) => {
    const p = join(ctx.root, d);
    return existsSync(p) && statSync(p).isDirectory();
  });
  return present ? [] : [{ file: null, message: `none of the test directories exist: ${dirs.join(", ")}` }];
};

export const RULE_EVALUATORS: Record<GuardrailRule["type"], RuleEvaluator> = {
  "no-secrets": noSecrets,
  "max-file-length": maxFileLength,
  "max-function-length": maxFunctionLength,
  "prohibited-pattern": prohibitedPattern,
  "require-tests-dir": requireTestsDir,
};
