import { ConflictException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { GuardrailPack, Prisma, Project } from "@prisma/client";
import {
  BLUEPRINTS,

  composeRules,
  DOMAIN_LABELS,
  ENTITY_LABELS,
  findStack,
  regulationsFor,
  STACKS,
  TOPIC_LABELS,
  VERTICAL_LABELS,
  VERTICALS,
  type Blueprint,
  type CatalogRule,
  type ChecklistItem,
  type Domain,
  type EntityType,
  type GuardrailRuleSetFile,
  type PackContext,
  type ProjectFlag,
  type Regulation,
  type SelectStackInput,
  type Vertical,
} from "@krama/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { fail } from "../common/errors.js";
import { footerText, renderFile, type FileFormat, type RenderDoc } from "../common/render.js";
import { guardrailDoc } from "../common/guardrail-doc.js";
import { GuardrailsService } from "../guardrails/guardrails.service.js";
import type { AuthUser } from "../common/auth-user.js";

export interface PackContent {
  rules: CatalogRule[];
  blueprints: Blueprint[];
  regulations: Regulation[];
  checklist: ChecklistItem[];
  stack: { key: string; name: string; layers: Record<string, string> };
}


export function projectFlags(p: Pick<Project, "government" | "existingProduction" | "accessibilityRequired">): ProjectFlag[] {
  const f: ProjectFlag[] = [];
  if (p.government) f.push("government");
  if (p.existingProduction) f.push("existingProduction");
  if (p.accessibilityRequired) f.push("accessibility");
  return f;
}

/** Machine-checkable subset of a pack, in the format the guardrail engine reads (guardrails.json). */
export function toRuleSetFile(name: string, version: number, rules: CatalogRule[]): GuardrailRuleSetFile {
  return {
    ruleSetId: name,
    name,
    version,
    rules: rules
      .filter((r) => r.check)
      .map((r) => ({
        id: r.id,
        name: r.title,
        type: r.check!.type,
        level: r.level === "WARN" ? "WARN" : "BLOCK",
        nonWaivable: r.level === "NON_WAIVABLE",
        appliesTo: r.check!.appliesTo ?? [],
        params: r.check!.params,
        description: r.text,
      })),
  };
}

@Injectable()
export class PacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsService,
    private readonly guardrails: GuardrailsService,
  ) {}

  stacks() {
    return STACKS;
  }

  private async brdApproved(projectId: string): Promise<boolean> {
    return (await this.prisma.document.count({ where: { projectId, type: "BRD", status: { in: ["APPROVED", "CLIENT_SIGNED_OFF"] } } })) > 0;
  }

  /** Preview of what a pack would contain for a stack and domain, before it is generated. */
  async preview(user: AuthUser, projectId: string, stackKey: string, domain: Domain, entityType: EntityType | null) {
    const p = await this.projects.getOrThrow(user, projectId);
    return this.compose({ ...p, domain, entityType }, stackKey, user.tenantId);
  }

  /** Pack content from the live master guardrails (latest published version per vertical). */
  private async compose(p: Project, stackKey: string, tenantId: string): Promise<PackContent> {
    const stack = findStack(stackKey);
    if (!stack) throw new NotFoundException(`Unknown stack ${stackKey}`);
    const ctx: PackContext = { domain: p.domain, entityType: p.entityType, platforms: p.platforms, stackTopics: stack.topics, flags: projectFlags(p) };
    const { rules: master } = await this.guardrails.masterRules(tenantId);
    const rules = composeRules(ctx, undefined, master);
    return {
      rules,
      blueprints: BLUEPRINTS,
      regulations: regulationsFor(rules),
      checklist: stack.checklist,
      stack: { key: stack.key, name: stack.name, layers: stack.layers },
    };
  }

  /** Only Tech Architects can select or change the stack (BRD-RBAC-04); the domain is confirmed at the same time (BRD-DOM-02). */
  async selectStack(user: AuthUser, projectId: string, input: SelectStackInput) {
    const p = await this.projects.getOrThrow(user, projectId);
    if (!(await this.brdApproved(projectId))) throw new ConflictException("Tech stack selection starts once the BRD is approved");
    const stack = findStack(input.stackKey);
    if (!stack) throw new NotFoundException("Unknown stack");
    const changing = Boolean(p.stackKey && p.stackKey !== input.stackKey);
    const entityType = input.domain === "GENERAL" ? null : (input.entityType ?? null);
    const updated = await this.prisma.$transaction(async (tx) => {
      const proj = await tx.project.update({
        where: { id: projectId },
        data: { stackKey: input.stackKey, stackRationale: input.rationale, stackSelectedById: user.id, stackSelectedAt: new Date(), domain: input.domain, entityType, domainConfirmed: true, domainConfirmedById: user.id, phase: "STACK" },
      });
      const n = (await tx.decision.count({ where: { projectId } })) + 1;
      await tx.decision.create({
        data: {
          tenantId: user.tenantId, projectId, number: n, createdById: user.id,
          title: `${changing ? "Change" : "Select"} technology stack: ${stack.name}`,
          context: `Domain ${DOMAIN_LABELS[input.domain]}${entityType ? ` (${ENTITY_LABELS[entityType]})` : ""}; platforms ${p.platforms.join(", ")}.`,
          decision: `${stack.layers.frontend}; ${stack.layers.backend}; ${stack.layers.database}.`,
          consequences: input.rationale,
        },
      });
      await tx.guardrailPack.updateMany({ where: { projectId, status: { in: ["SUBMITTED", "APPROVED"] } }, data: { status: "SUPERSEDED" } });
      return proj;
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "project.domain_confirmed", entityType: "project", entityId: projectId, projectId, data: { domain: input.domain, entityType } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: changing ? "stack.changed" : "stack.selected", entityType: "project", entityId: projectId, projectId, data: { stackKey: input.stackKey, previous: p.stackKey } });
    const pack = await this.generate(user, updated);
    return { project: updated, pack };
  }

  private async generate(user: AuthUser, p: Project) {
    const content = await this.compose(p, p.stackKey!, user.tenantId);
    const version = ((await this.prisma.guardrailPack.aggregate({ where: { projectId: p.id }, _max: { version: true } }))._max.version ?? 0) + 1;
    const pack = await this.prisma.guardrailPack.create({
      data: {
        tenantId: user.tenantId, projectId: p.id, version, status: "SUBMITTED", domain: p.domain, entityType: p.entityType, stackKey: p.stackKey!,
        flags: projectFlags(p), content: content as unknown as Prisma.InputJsonValue, generatedById: user.id,
      },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "pack.generated", entityType: "guardrail_pack", entityId: pack.id, projectId: p.id, data: { version, rules: content.rules.length } });
    return pack;
  }

  async regenerate(user: AuthUser, projectId: string) {
    const p = await this.projects.getOrThrow(user, projectId);
    if (!p.stackKey) throw new ConflictException("Select a stack first");
    await this.prisma.guardrailPack.updateMany({ where: { projectId, status: "SUBMITTED" }, data: { status: "SUPERSEDED" } });
    return this.generate(user, p);
  }

  async list(user: AuthUser, projectId: string) {
    await this.projects.getOrThrow(user, projectId);
    const packs = await this.prisma.guardrailPack.findMany({ where: { projectId }, orderBy: { version: "desc" } });
    const decisions = await this.prisma.decision.findMany({ where: { projectId }, orderBy: { number: "desc" } });
    return { packs, decisions };
  }

  async decide(user: AuthUser, packId: string, input: { decision: "APPROVE" | "REJECT" | "WITHDRAW"; note?: string }) {
    const pack = await this.prisma.guardrailPack.findFirst({ where: { id: packId, tenantId: user.tenantId } });
    if (!pack) throw new NotFoundException("Pack not found");
    await this.projects.getOrThrow(user, pack.projectId);
    if (input.decision !== "WITHDRAW" && pack.status !== "SUBMITTED") throw new ConflictException("Only a submitted pack can be approved or rejected");
    if (input.decision === "WITHDRAW" && pack.status !== "APPROVED") throw new ConflictException("Only an approved pack can be withdrawn");
    const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "WITHDRAWN";
    const updated = await this.prisma.$transaction(async (tx) => {
      if (status === "APPROVED") await tx.guardrailPack.updateMany({ where: { projectId: pack.projectId, status: "APPROVED" }, data: { status: "SUPERSEDED" } });
      const u = await tx.guardrailPack.update({ where: { id: packId }, data: { status, approvedById: status === "APPROVED" ? user.id : undefined, approvedAt: status === "APPROVED" ? new Date() : undefined, decisionNote: input.note } });
      if (status === "APPROVED") await tx.project.update({ where: { id: pack.projectId }, data: { phase: "DEVELOPMENT" } });
      return u;
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: `pack.${status.toLowerCase()}`, entityType: "guardrail_pack", entityId: packId, projectId: pack.projectId, data: { version: pack.version, note: input.note ?? "" } });
    return updated;
  }

  async approvedPack(projectId: string): Promise<GuardrailPack | null> {
    return this.prisma.guardrailPack.findFirst({ where: { projectId, status: "APPROVED" }, orderBy: { version: "desc" } });
  }

  // ---------- downloads (BRD-DOM-04, DOM-05, BRD-DG-09) ----------

  async download(
    user: AuthUser,
    projectId: string,
    packId: string,
    opts: { kind: "guardrails" | "blueprints" | "rules" | "checklist" | "ci"; vertical?: Vertical; topic?: string; format: FileFormat },
  ) {
    const project = await this.projects.getOrThrow(user, projectId);
    const pack = await this.prisma.guardrailPack.findFirst({ where: { id: packId, projectId } });
    if (!pack) throw new NotFoundException("Pack not found");
    if (pack.status !== "APPROVED") fail("MSG-STK-02", HttpStatus.CONFLICT);
    const c = pack.content as unknown as PackContent;
    const footer = footerText({ project: project.code, version: `Pack v${pack.version}`, user: user.email });
    const base = `${project.code}_pack_v${pack.version}`;
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "pack.downloaded", entityType: "guardrail_pack", entityId: packId, projectId, data: { ...opts, version: pack.version } });

    if (opts.kind === "rules") {
      return { name: "AGENTS.md", type: "text/markdown; charset=utf-8", body: Buffer.from(this.rulesPack(project, pack, c)) };
    }
    if (opts.kind === "ci") {
      const file = toRuleSetFile(`${project.code}-pack`, pack.version, c.rules);
      return { name: "guardrails.json", type: "application/json", body: Buffer.from(JSON.stringify(file, null, 2)) };
    }
    let doc: RenderDoc;
    const meta: [string, string][] = [
      ["Project", `${project.name} (${project.code})`],
      ["Domain", `${DOMAIN_LABELS[pack.domain]}${pack.entityType ? ` · ${ENTITY_LABELS[pack.entityType]}` : ""}`],
      ["Stack", c.stack.name],
      ["Pack version", `v${pack.version}, approved ${pack.approvedAt?.toISOString().slice(0, 10) ?? ""}`],
    ];
    if (opts.kind === "checklist") {
      doc = {
        title: `${project.name} — Software checklist`,
        meta,
        sections: [{ heading: "Install and confirm in Krama", blocks: [{ kind: "table", head: ["Tool", "Version", "Check with", "Required"], rows: c.checklist.map((i) => [i.name, i.version, i.verify, i.required ? "Yes" : "Optional"]) }] }],
        footer,
      };
    } else if (opts.kind === "blueprints") {
      const bps = c.blueprints.filter((b) => !opts.vertical || b.vertical === opts.vertical);
      doc = {
        title: `${project.name} — ${opts.vertical ? `${VERTICAL_LABELS[opts.vertical]} blueprint` : "Blueprints"}`,
        meta,
        sections: bps.flatMap((b) => [{ heading: b.title, blocks: [] }, ...b.sections.map((s) => ({ heading: s.heading, level: 2 as const, blocks: [{ kind: "bullets" as const, items: s.items }] }))]),
        footer,
      };
    } else {
      const rules = c.rules.filter((r) => (!opts.vertical || r.vertical === opts.vertical) && (!opts.topic || r.topic === opts.topic));
      doc = guardrailDoc(`${project.name} — ${opts.topic ? TOPIC_LABELS[opts.topic] ?? opts.topic : opts.vertical ? VERTICAL_LABELS[opts.vertical] : "All"} guardrails`, meta, rules, c.regulations, footer);
    }
    const name = `${base}_${opts.kind}${opts.vertical ? `_${opts.vertical.toLowerCase()}` : ""}${opts.topic ? `_${opts.topic}` : ""}`;
    return renderFile(doc, name, opts.format);
  }

  /** AGENTS.md: guardrails formatted for a developer's AI coding agent. */
  rulesPack(project: Project, pack: GuardrailPack, c: PackContent): string {
    const rules = c.rules.filter((r) => r.vertical === "TECHNOLOGY" || r.vertical === "INFRASTRUCTURE");
    const lines = [
      `# AGENTS.md — ${project.name} (${project.code})`,
      "",
      `Krama rules pack v${pack.version} for ${c.stack.name}, domain ${DOMAIN_LABELS[pack.domain]}. Approved by the Tech Architect.`,
      "Load this file into your AI coding agent before generating code. Follow every rule. If a rule blocks you, stop and ask the developer; exceptions are requested in Krama.",
      "",
      "## Stack",
      ...Object.entries(c.stack.layers).map(([k, v]) => `- ${k}: ${v}`),
      "",
      "## Never do these (non-waivable)",
      ...rules.filter((r) => r.level === "NON_WAIVABLE").map((r) => `- [${r.id}] ${r.title}: ${r.text}`),
      "",
      "## Must follow (block)",
      ...rules.filter((r) => r.level === "BLOCK").map((r) => `- [${r.id}] ${r.title}: ${r.text}`),
      "",
      "## Should follow (warn)",
      ...rules.filter((r) => r.level === "WARN").map((r) => `- [${r.id}] ${r.title}: ${r.text}`),
      "",
      "## Data handling",
      "- Never put real client personal data (names, phone, email, PAN, Aadhaar, account or card numbers) in prompts, code, tests or fixtures. Use masked samples.",
      "- Use only the approved AI tools; do not send client code to any other AI service.",
      "",
      ...(project.existingProduction ? ["## Existing client production system", "- Do not break existing APIs, schemas or contracts. Add regression tests for every changed area.", ""] : []),
      `_Generated by Krama on ${new Date().toISOString().slice(0, 10)} · Confidential_`,
      "",
    ];
    return lines.join("\n");
  }

  // ---------- library (master guardrails and blueprints) ----------

  async library(user: AuthUser, filter: { domain?: Domain; entityType?: EntityType; vertical?: Vertical }) {
    const { rules: master, versions } = await this.guardrails.masterRules(user.tenantId);
    const rules = master.filter((r) => {
      if (filter.vertical && r.vertical !== filter.vertical) return false;
      if (filter.domain && r.when?.domains && !r.when.domains.includes(filter.domain)) return false;
      if (filter.entityType && r.when?.entityTypes && !r.when.entityTypes.includes(filter.entityType)) return false;
      return true;
    });
    const byVertical = VERTICALS.map((v) => ({
      vertical: v,
      label: VERTICAL_LABELS[v],
      topics: [...new Set(rules.filter((r) => r.vertical === v).map((r) => r.topic))].map((t) => ({ topic: t, label: TOPIC_LABELS[t] ?? t, count: rules.filter((r) => r.vertical === v && r.topic === t).length })),
      ruleCount: rules.filter((r) => r.vertical === v).length,
      version: versions[v],
      blueprint: BLUEPRINTS.find((b) => b.vertical === v) ?? null,
    }));
    const version = filter.vertical ? `Master v${versions[filter.vertical]}` : "Master (latest published per vertical)";
    return { version, byVertical, rules, regulations: regulationsFor(rules) };
  }

  async libraryDownload(user: AuthUser, opts: { kind: "guardrails" | "blueprints"; vertical: Vertical; domain?: Domain; topic?: string; format: FileFormat }) {
    const lib = await this.library(user, { vertical: opts.vertical, domain: opts.domain });
    const footer = footerText({ project: "Master library", version: lib.version, user: user.email });
    const meta: [string, string][] = [["Vertical", VERTICAL_LABELS[opts.vertical]], ["Domain filter", opts.domain ? DOMAIN_LABELS[opts.domain] : "All domains"], ["Version", lib.version]];
    const doc: RenderDoc =
      opts.kind === "blueprints"
        ? (() => {
            const b = BLUEPRINTS.find((x) => x.vertical === opts.vertical)!;
            return { title: b.title, meta, sections: b.sections.map((s) => ({ heading: s.heading, blocks: [{ kind: "bullets" as const, items: s.items }] })), footer };
          })()
        : guardrailDoc(`${VERTICAL_LABELS[opts.vertical]} guardrails${opts.topic ? ` — ${TOPIC_LABELS[opts.topic] ?? opts.topic}` : ""}`, meta, lib.rules.filter((r) => !opts.topic || r.topic === opts.topic), lib.regulations, footer);
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "library.downloaded", entityType: "library", entityId: opts.vertical, data: opts });
    const name = `Krama_${opts.vertical.toLowerCase()}_${opts.kind}${opts.topic ? `_${opts.topic}` : ""}${opts.domain ? `_${opts.domain.toLowerCase()}` : ""}`;
    return renderFile(doc, name, opts.format);
  }
}
