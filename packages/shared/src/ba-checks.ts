// Requirement and BRD guardrail checks run by Krama at submission (BA blueprint section 6, BRD-G rules).
import type { AcceptanceCriterion, Citation, DocumentContent, Lens } from "./artefacts.js";
import { BRD_SECTIONS } from "./artefacts.js";

export const VAGUE_WORDS = [
  "fast",
  "quick",
  "quickly",
  "user-friendly",
  "user friendly",
  "easy",
  "simple",
  "etc",
  "as needed",
  "as appropriate",
  "appropriate",
  "tbd",
  "and/or",
  "seamless",
  "seamlessly",
  "real-time",
  "real time",
  "automated",
  "intelligent",
  "all formats",
  "offline mode",
  "robust",
];

const VAGUE_RE = new RegExp(`(^|[^a-z])(${VAGUE_WORDS.map((w) => w.replace(/[/-]/g, "\\$&")).join("|")})(?=[^a-z]|$)`, "i");

export function findVagueWord(text: string): string | null {
  const m = VAGUE_RE.exec(text);
  return m?.[2] ?? null;
}

export type CheckSeverity = "CRITICAL_BLOCKER" | "HIGH" | "MEDIUM" | "LOW";

export interface RuleFinding {
  rule: string;
  severity: CheckSeverity;
  ref: string;
  message: string;
  quote?: string;
}

export interface ReqForCheck {
  code: string;
  description: string;
  type: "FUNCTIONAL" | "NON_FUNCTIONAL" | "CONSTRAINT";
  citations: Citation[];
  acceptanceCriteria: AcceptanceCriterion[];
  aiDrafted: boolean;
  confirmed: boolean;
}

export interface FindingForCheck {
  code: string;
  lens: Lens;
  severity: "LOW" | "MEDIUM" | "HIGH";
  blocking: boolean;
  status: string;
  question: string;
}

const NFR_TOPICS: [string, RegExp][] = [
  ["performance", /\b(performance|response time|latency|throughput|seconds?|concurren)/i],
  ["security", /\b(secur|authenti|authori|encrypt|mfa|access control|vapt|owasp)/i],
  ["accessibility", /\b(accessib|wcag|gigw|screen reader)/i],
  ["data retention", /\b(retention|retain|purge|archiv|delete after)/i],
];

/** BA-G01, G05, G07, G09, G10, G13 and BRD-G02. */
export function runBrdRuleChecks(input: {
  requirements: ReqForCheck[];
  findings: FindingForCheck[];
  document: DocumentContent | null;
}): RuleFinding[] {
  const out: RuleFinding[] = [];
  for (const r of input.requirements) {
    if (r.citations.length === 0)
      out.push({ rule: "BA-G01", severity: "CRITICAL_BLOCKER", ref: r.code, message: "Requirement has no source.", quote: r.description });
    if (r.type === "FUNCTIONAL" && r.acceptanceCriteria.length === 0)
      out.push({ rule: "BA-G05", severity: "HIGH", ref: r.code, message: "Functional requirement has no Given / When / Then criterion.", quote: r.description });
    if (r.aiDrafted && !r.confirmed)
      out.push({ rule: "BA-G10", severity: "HIGH", ref: r.code, message: "AI-drafted requirement not yet confirmed by a BA.", quote: r.description });
    const vague = findVagueWord(r.description);
    if (vague) out.push({ rule: "BA-G13", severity: "MEDIUM", ref: r.code, message: `Vague word "${vague}"; state a measurable value.`, quote: r.description });
  }
  for (const f of input.findings) {
    if (f.status === "OPEN" && f.blocking)
      out.push({ rule: "BA-G07", severity: "CRITICAL_BLOCKER", ref: f.code, message: `Blocking question unresolved: ${f.question}` });
  }
  const corpus = input.requirements.map((r) => r.description).join(" ");
  for (const [topic, re] of NFR_TOPICS) {
    if (!re.test(corpus))
      out.push({ rule: "BA-G09", severity: "HIGH", ref: "Section 12", message: `No ${topic} requirement stated, and not marked not applicable.` });
  }
  if (input.document) {
    const headings = input.document.sections.map((s) => s.heading.toLowerCase());
    const missing = BRD_SECTIONS.filter((h) => !headings.some((x) => x.includes(h.toLowerCase())));
    if (missing.length) out.push({ rule: "BRD-G02", severity: "HIGH", ref: "Document", message: `Missing sections: ${missing.join(", ")}.` });
  } else {
    out.push({ rule: "BRD-G02", severity: "CRITICAL_BLOCKER", ref: "Document", message: "No BRD draft exists." });
  }
  return out;
}

export type AuditStatus = "READY_FOR_FSD" | "NEEDS_CLARIFICATION" | "BLOCKED_HIGH_RISK";

/** Combine Krama rule findings with the AI Deep Audit status (BRD-G11). */
export function overallAuditStatus(rules: RuleFinding[], aiStatus: AuditStatus, aiCritical: number): AuditStatus {
  if (aiStatus === "BLOCKED_HIGH_RISK" || aiCritical > 0 || rules.some((r) => r.severity === "CRITICAL_BLOCKER")) return "BLOCKED_HIGH_RISK";
  if (aiStatus === "NEEDS_CLARIFICATION" || rules.some((r) => r.severity === "HIGH")) return "NEEDS_CLARIFICATION";
  return "READY_FOR_FSD";
}
