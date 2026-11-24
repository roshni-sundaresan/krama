import { TOPIC_LABELS, type CatalogRule, type Regulation } from "@krama/shared";
import type { RenderDoc, RenderSection } from "./render.js";

const LEVEL_LABEL = { NON_WAIVABLE: "Non-waivable", BLOCK: "Block", WARN: "Warn" } as const;

/** A guardrail document: rules grouped by topic, then the regulations they cite. */
export function guardrailDoc(title: string, meta: [string, string][], rules: CatalogRule[], regs: Regulation[], footer: string): RenderDoc {
  const topics = [...new Set(rules.map((r) => r.topic))];
  const sections: RenderSection[] = [
    { heading: "How to read this pack", blocks: [{ kind: "p", text: "Non-waivable rules can never have exceptions. Block rules stop the gate unless the Tech Architect approves a time-limited exception in Krama. Warn rules are recorded." }] },
    ...topics.map((t) => ({
      heading: TOPIC_LABELS[t] ?? t,
      blocks: [{ kind: "table" as const, head: ["ID", "Guardrail", "Level", "Source"], widths: [11, 59, 13, 17], rows: rules.filter((r) => r.topic === t).map((r) => [r.id, `${r.title}. ${r.text}`, LEVEL_LABEL[r.level], (r.sources ?? []).join(", ") || "Idealake"]) }],
    })),
    { heading: "Regulations and standards used", blocks: regs.length ? [{ kind: "table", head: ["Source", "Version or date"], rows: regs.map((r) => [r.name, r.version]) }] : [{ kind: "p", text: "Idealake standards only.", muted: true }] },
  ];
  return { title, meta, sections, footer };
}

