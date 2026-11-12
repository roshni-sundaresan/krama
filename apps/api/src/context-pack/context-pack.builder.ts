import type {
  ChecklistItem,
  CodingTool,
  ContextPack,
  DepthMode,
  GuardrailExceptionsFile,
  GuardrailRuleSetFile,
} from "@krama/shared";
import { CODING_TOOLS, CONTEXT_PACK_FILES } from "@krama/shared";

export interface PackRequirement {
  code: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  citations: { sourceItemId: string; quote: string; location?: string }[];
}

export interface PackDecision {
  number: number;
  title: string;
  context: string;
  decision: string;
  consequences: string;
  status: string;
}

export interface PackInput {
  project: { id: string; name: string; technology: string; projectType: string; depthMode: DepthMode; approvedTools: string[]; clientWork: boolean };
  requirements: PackRequirement[];
  decisions: PackDecision[];
  guardrails: GuardrailRuleSetFile;
  exceptions: GuardrailExceptionsFile;
  now?: Date;
}

const TOOL_CHECK: Record<CodingTool, ChecklistItem> = {
  claude: { name: "Claude Code", command: "claude", required: false, installHint: "npm install -g @anthropic-ai/claude-code (approved build only)" },
  copilot: { name: "GitHub Copilot CLI", command: "copilot", required: false, installHint: "npm install -g @github/copilot (approved build only)" },
  codex: { name: "OpenAI Codex CLI", command: "codex", required: false, installHint: "npm install -g @openai/codex (approved build only)" },
};

/** Required software per technology. TODO: move to versioned blueprints managed by Lead Architects. */
export const TECH_CHECKLISTS: Record<string, ChecklistItem[]> = {
  "typescript-node": [
    { name: "Node.js", command: "node", minVersion: "22.12.0", required: true, installHint: "https://nodejs.org (LTS)" },
    { name: "pnpm", command: "pnpm", minVersion: "10.0.0", required: true, installHint: "corepack enable && corepack prepare pnpm@latest --activate" },
  ],
  python: [
    { name: "Python", command: "python3", minVersion: "3.11.0", required: true, installHint: "https://www.python.org/downloads/" },
    { name: "uv", command: "uv", required: false, installHint: "https://docs.astral.sh/uv/" },
  ],
  "java-spring": [
    { name: "Java JDK", command: "java", minVersion: "21.0.0", required: true, installHint: "Temurin 21 LTS" },
    { name: "Maven", command: "mvn", minVersion: "3.9.0", required: true, installHint: "https://maven.apache.org" },
  ],
  dotnet: [{ name: ".NET SDK", command: "dotnet", minVersion: "8.0.0", required: true, installHint: "https://dotnet.microsoft.com/download" }],
};

export function approvedToolsOf(tools: string[]): CodingTool[] {
  return tools.filter((t): t is CodingTool => (CODING_TOOLS as readonly string[]).includes(t));
}

export function renderAgentsMd(input: PackInput): string {
  const { project, guardrails } = input;
  const rules = guardrails.rules
    .map((r) => {
      const level = project.depthMode === "governed" ? "BLOCK" : r.level;
      return `- **${r.id}** — ${r.name} (${level}${r.nonWaivable ? ", non-waivable" : ""})${r.description ? `: ${r.description}` : ""}`;
    })
    .join("\n");
  return `# AGENTS.md — Krama rules pack

Project: **${project.name}** (${project.projectType}, ${project.technology})
Depth mode: **${project.depthMode}**${project.clientWork ? "\nClient work: **yes** — treat all source material as confidential." : ""}

These rules are mandatory for any AI coding tool or human working in this repository.
They are enforced server-side by the \`krama-guardrails\` required status check; local
changes to this file have no effect on enforcement.

## Scope
1. Implement only the approved requirements in \`requirements.md\`. Do not invent features.
2. Follow the architecture decisions in \`ADR.md\`. Propose a new ADR instead of deviating.
3. Reference requirement codes (e.g. REQ-001) in code comments, test names and commit messages.

## Engineering rules
- Never hardcode secrets, keys, tokens or passwords; read configuration from environment variables.
- Only the Krama model gateway (Claude on Amazon Bedrock, ap-south-1) may be used for AI features.
- Never disable or bypass audit logging.
- Every module ships with tests under \`tests/\` (or \`test/\`).
- Keep files and functions small and readable.
- Do not modify anything under \`.krama/\`.

## Guardrails (rule set "${guardrails.name}" v${guardrails.version})
${rules}

Need an exception? Request it in Krama (Guardrails → Request exception). Lead Architect
approval is required; non-waivable rules can never be excepted.
`;
}

export function renderRequirementsMd(input: PackInput): string {
  const lines = [`# Approved requirements — ${input.project.name}`, ""];
  for (const r of input.requirements) {
    lines.push(`## ${r.code}: ${r.title}`, "", `- Type: ${r.type}`, `- Priority: ${r.priority}`, "", r.description, "", "Sources:");
    for (const c of r.citations) lines.push(`- \`${c.sourceItemId}\`${c.location ? ` (${c.location})` : ""}: "${c.quote}"`);
    lines.push("");
  }
  if (input.requirements.length === 0) lines.push("_No approved requirements._", "");
  return lines.join("\n");
}

export function renderAdrMd(input: PackInput): string {
  const decisions: PackDecision[] = input.decisions.length
    ? input.decisions
    : [
        {
          number: 1,
          title: `Use ${input.project.technology} for ${input.project.name}`,
          context: "Default stack for the project type, selected at project creation.",
          decision: `Build with ${input.project.technology} following the Idealake reference blueprint.`,
          consequences: "Developers need the tools listed in checklist.json.",
          status: "ACCEPTED",
        },
      ];
  return decisions
    .map(
      (d) =>
        `# ADR-${String(d.number).padStart(3, "0")}: ${d.title}\n\nStatus: ${d.status}\n\n## Context\n${d.context}\n\n## Decision\n${d.decision}\n\n## Consequences\n${d.consequences}\n`,
    )
    .join("\n---\n\n");
}

export function buildContextPack(input: PackInput): ContextPack {
  const approvedTools = approvedToolsOf(input.project.approvedTools);
  const checklistItems: ChecklistItem[] = [
    { name: "Git", command: "git", minVersion: "2.40.0", required: true, installHint: "https://git-scm.com/downloads" },
    ...(TECH_CHECKLISTS[input.project.technology] ?? []),
    ...approvedTools.map((t) => TOOL_CHECK[t]),
  ];
  return {
    schemaVersion: 1,
    generatedAt: (input.now ?? new Date()).toISOString(),
    project: {
      id: input.project.id,
      name: input.project.name,
      technology: input.project.technology,
      projectType: input.project.projectType,
      depthMode: input.project.depthMode,
    },
    approvedTools,
    checklist: { mode: input.project.depthMode, items: checklistItems },
    guardrails: input.guardrails,
    exceptions: input.exceptions,
    files: {
      [CONTEXT_PACK_FILES.agents]: renderAgentsMd(input),
      [CONTEXT_PACK_FILES.adr]: renderAdrMd(input),
      [CONTEXT_PACK_FILES.requirements]: renderRequirementsMd(input),
    },
  };
}
