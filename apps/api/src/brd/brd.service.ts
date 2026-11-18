import { BadRequestException, ConflictException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { Document as Doc, Prisma, Project } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  DocumentContentSchema,
  msg,
  overallAuditStatus,
  runBrdRuleChecks,
  type AcceptanceCriterion,
  type Citation,
  type DocumentContent,
  type SignoffInput,
} from "@krama/shared";
import type { ProjectContext, RunEvent, SourceInput } from "@krama/workflows";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { TemporalService } from "../temporal/temporal.service.js";
import { StorageService } from "../storage/storage.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { SourcesService } from "../sources/sources.module.js";
import { fail } from "../common/errors.js";
import { footerText, renderFile, type FileFormat, type RenderDoc } from "../common/render.js";
import type { AuthUser } from "../common/auth-user.js";

const EDITABLE = new Set(["DRAFT", "CHANGES_REQUESTED"]);

export function projectContext(p: Project): ProjectContext {
  return {
    code: p.code, name: p.name, clientName: p.clientName, domain: p.domain, entityType: p.entityType, platforms: p.platforms,
    government: p.government, existingProduction: p.existingProduction, accessibilityRequired: p.accessibilityRequired,
    integrations: p.integrations, regulations: p.regulations,
  };
}

function content(doc: Doc): DocumentContent {
  const parsed = DocumentContentSchema.safeParse(doc.content);
  return parsed.success ? parsed.data : { title: `BRD v${doc.version}`, sections: [] };
}

function unconfirmedCount(c: DocumentContent): number {
  return c.sections.reduce((n, s) => n + s.statements.filter((st) => st.aiSuggested && !st.confirmed).length, 0);
}

@Injectable()
export class BrdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly temporal: TemporalService,
    private readonly storage: StorageService,
    private readonly projects: ProjectsService,
    private readonly sources: SourcesService,
  ) {}

  private async latest(projectId: string) {
    return this.prisma.document.findFirst({ where: { projectId, type: "BRD" }, orderBy: { version: "desc" } });
  }

  private async docForUser(user: AuthUser, documentId: string) {
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException("Document not found");
    await this.projects.getOrThrow(user, doc.projectId);
    return doc;
  }

  private assertEditable(doc: Doc) {
    if (!EDITABLE.has(doc.status)) throw new ConflictException(`BRD v${doc.version} is ${doc.status.toLowerCase().replace(/_/g, " ")} and cannot be edited`);
  }

  // ---------- drafting ----------

  async startDraft(user: AuthUser, projectId: string) {
    const project = await this.projects.getOrThrow(user, projectId);
    const readiness = await this.sources.readiness(user, projectId);
    const failing = readiness.rules.filter((r) => !r.passed);
    if (failing.length) {
      const first = failing[0]!;
      if (first.id === "IN-G01") {
        const item = await this.prisma.sourceItem.findFirst({ where: { projectId, personalData: true, maskingConfirmedAt: null } });
        fail("MSG-GEN-01", HttpStatus.CONFLICT, { file: item?.title ?? "a document" });
      }
      throw new ConflictException({ code: "READINESS", message: `Intake is not ready: ${failing.map((r) => `${r.id} ${r.title}`).join("; ")}` });
    }
    const prev = await this.latest(projectId);
    if (prev && ["DRAFTING", "IN_REVIEW", "APPROVED", "CLIENT_SIGNED_OFF"].includes(prev.status))
      throw new ConflictException(`BRD v${prev.version} is ${prev.status.toLowerCase().replace(/_/g, " ")}; a new draft cannot start now`);

    const items = await this.prisma.sourceItem.findMany({ where: { projectId, maskedText: { not: null } }, orderBy: { createdAt: "asc" } });
    const sourceInputs: SourceInput[] = items.map((i) => ({
      id: i.id, title: i.title, kind: i.kind, docType: i.docType, version: i.version,
      text: i.maskedText ?? "", // masked text only (BRD-DG-02)
    }));
    const version = (prev?.version ?? 0) + 1;
    const runId = randomUUID();
    const doc = await this.prisma.$transaction(async (tx) => {
      if (prev && EDITABLE.has(prev.status)) await tx.document.update({ where: { id: prev.id }, data: { status: "SUPERSEDED" } });
      const d = await tx.document.create({ data: { tenantId: user.tenantId, projectId, type: "BRD", version, status: "DRAFTING", createdById: user.id } });
      await tx.workflowRun.create({
        data: { id: runId, tenantId: user.tenantId, projectId, workflowType: "brdDraft", startedById: user.id, input: { documentId: d.id, sourceIds: items.map((i) => i.id) } },
      });
      return d;
    });
    try {
      const wfId = await this.temporal.startBrdDraft({ tenantId: user.tenantId, projectId, runId, version, project: projectContext(project), sources: sourceInputs });
      await this.prisma.workflowRun.update({ where: { id: runId }, data: { temporalWorkflowId: wfId } });
    } catch (err) {
      await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: "FAILED", error: String(err) } });
      await this.prisma.document.update({ where: { id: doc.id }, data: { status: "DRAFT" } });
      throw err;
    }
    await this.prisma.project.update({ where: { id: projectId }, data: { phase: "BRD" } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "brd.draft_started", entityType: "document", entityId: doc.id, projectId, data: { version, sources: items.length } });
    return { documentId: doc.id, runId, version };
  }

  /** Persist workflow events (called by the TS worker with the internal token). */
  async recordRunEvent(runId: string, event: RunEvent) {
    const run = await this.prisma.workflowRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException("Run not found");
    const documentId = (run.input as { documentId?: string }).documentId;
    if (!documentId) throw new BadRequestException("Run has no document");
    const base = { tenantId: run.tenantId, projectId: run.projectId };
    const usage = async (u: { provider: string; modelId: string; tier: string; task: string; inputTokens: number; outputTokens: number; costUsd: number }[]) => {
      if (u.length) await this.prisma.tokenUsage.createMany({ data: u.map((x) => ({ ...base, runId, ...x })) });
    };
    switch (event.type) {
      case "stage":
        await this.prisma.workflowRun.update({ where: { id: runId }, data: { stage: event.stage } });
        break;
      case "requirements":
        await this.prisma.requirement.deleteMany({ where: { documentId } });
        await this.prisma.requirement.createMany({
          data: event.requirements.map((r) => ({
            ...base, documentId, code: r.code, title: r.title, description: r.description, type: r.type, priority: r.priority,
            citations: r.citations as Prisma.InputJsonValue, acceptanceCriteria: (r.acceptanceCriteria ?? []) as Prisma.InputJsonValue, aiDrafted: true,
          })),
        });
        await usage(event.usage);
        break;
      case "findings":
        await this.prisma.lensFinding.deleteMany({ where: { documentId } });
        await this.prisma.lensFinding.createMany({
          data: event.findings.map((f, i) => ({
            ...base, documentId, code: `Q-${String(i + 1).padStart(3, "0")}`, lens: f.lens, category: f.category, description: f.description,
            severity: f.severity, question: f.question, proposedDefault: f.proposedDefault, blocking: f.blocking, relatedRequirementCodes: f.relatedRequirementCodes,
          })),
        });
        await usage(event.usage);
        break;
      case "document": {
        const generation = { model: event.usage[0]?.modelId ?? "unknown", provider: event.usage[0]?.provider ?? "unknown", promptVersions: event.promptVersions, sourceIds: (run.input as { sourceIds?: string[] }).sourceIds ?? [], startedBy: run.startedById, generatedAt: new Date().toISOString() };
        await this.prisma.document.update({ where: { id: documentId }, data: { content: event.document as unknown as Prisma.InputJsonValue, status: "DRAFT", generation } });
        await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: "COMPLETED", stage: "COMPLETED", finishedAt: new Date() } });
        await usage(event.usage);
        await this.audit.record({ ...base, actorType: "worker", action: "brd.generated", entityType: "document", entityId: documentId, data: generation });
        break;
      }
      case "failed":
        await this.prisma.workflowRun.update({ where: { id: runId }, data: { status: "FAILED", error: event.error, finishedAt: new Date() } });
        await this.prisma.document.update({ where: { id: documentId }, data: { status: "DRAFT" } });
        break;
    }
  }

  // ---------- workspace ----------

  async workspace(user: AuthUser, projectId: string) {
    const project = await this.projects.getOrThrow(user, projectId);
    const doc = await this.latest(projectId);
    const sources = await this.prisma.sourceItem.findMany({ where: { projectId }, select: { id: true, title: true, kind: true, docType: true, version: true } });
    if (!doc) return { project, document: null, requirements: [], findings: [], sources, run: null, audit: null, signoff: null, versions: [] };
    const [requirements, findings, run, audit, signoff, versions] = await Promise.all([
      this.prisma.requirement.findMany({ where: { documentId: doc.id }, orderBy: { code: "asc" } }),
      this.prisma.lensFinding.findMany({ where: { documentId: doc.id }, orderBy: { code: "asc" } }),
      this.prisma.workflowRun.findFirst({ where: { projectId, workflowType: "brdDraft" }, orderBy: { startedAt: "desc" } }),
      this.prisma.deepAudit.findFirst({ where: { documentId: doc.id }, orderBy: { createdAt: "desc" } }),
      this.prisma.clientSignoff.findFirst({ where: { documentId: doc.id, withdrawnAt: null }, orderBy: { createdAt: "desc" } }),
      this.prisma.document.findMany({ where: { projectId, type: "BRD" }, orderBy: { version: "desc" }, select: { id: true, version: true, status: true, createdAt: true } }),
    ]);
    const c = content(doc);
    return { project, document: { ...doc, content: c, unconfirmed: unconfirmedCount(c) }, requirements, findings, sources, run, audit, signoff, versions };
  }

  async updateRequirement(user: AuthUser, requirementId: string, input: { description?: string; acceptanceCriteria?: AcceptanceCriterion[]; confirmed?: boolean }) {
    const req = await this.prisma.requirement.findFirst({ where: { id: requirementId, tenantId: user.tenantId } });
    if (!req?.documentId) throw new NotFoundException("Requirement not found");
    const doc = await this.docForUser(user, req.documentId);
    this.assertEditable(doc);
    const updated = await this.prisma.requirement.update({
      where: { id: requirementId },
      data: {
        description: input.description,
        acceptanceCriteria: input.acceptanceCriteria as Prisma.InputJsonValue | undefined,
        confirmed: input.confirmed,
        confirmedById: input.confirmed ? user.id : input.confirmed === false ? null : undefined,
      },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: input.confirmed ? "brd.requirement_confirmed" : "brd.requirement_edited", entityType: "requirement", entityId: requirementId, projectId: doc.projectId, data: { code: req.code } });
    return updated;
  }

  async confirmAllRequirements(user: AuthUser, documentId: string) {
    const doc = await this.docForUser(user, documentId);
    this.assertEditable(doc);
    const r = await this.prisma.requirement.updateMany({ where: { documentId, confirmed: false }, data: { confirmed: true, confirmedById: user.id } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "brd.requirements_confirmed", entityType: "document", entityId: documentId, projectId: doc.projectId, data: { count: r.count } });
    return { confirmed: r.count };
  }

  /** Confirm, edit or remove AI-drafted statements (BA-G10, BRD-DG-06). */
  async editStatement(user: AuthUser, documentId: string, input: { section: number; statement?: number; action: "confirm" | "remove" | "edit" | "confirmSection"; text?: string }) {
    const doc = await this.docForUser(user, documentId);
    this.assertEditable(doc);
    const c = content(doc);
    const sec = c.sections[input.section];
    if (!sec) throw new BadRequestException("No such section");
    if (input.action === "confirmSection") sec.statements.forEach((s) => (s.confirmed = true));
    else {
      const st = input.statement === undefined ? undefined : sec.statements[input.statement];
      if (!st) throw new BadRequestException("No such statement");
      if (input.action === "confirm") st.confirmed = true;
      if (input.action === "edit") {
        if (!input.text?.trim()) throw new BadRequestException("Text is required");
        st.text = input.text.trim();
        st.confirmed = true;
      }
      if (input.action === "remove") sec.statements.splice(input.statement!, 1);
    }
    await this.prisma.document.update({ where: { id: documentId }, data: { content: c as unknown as Prisma.InputJsonValue } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: `brd.statement_${input.action}`, entityType: "document", entityId: documentId, projectId: doc.projectId, data: { section: sec.heading } });
    return { unconfirmed: unconfirmedCount(c) };
  }

  async resolveFinding(user: AuthUser, findingId: string, input: { action: "answer" | "acceptDefault" | "reopen"; answer?: string }) {
    const f = await this.prisma.lensFinding.findFirst({ where: { id: findingId, tenantId: user.tenantId } });
    if (!f?.documentId) throw new NotFoundException("Finding not found");
    const doc = await this.docForUser(user, f.documentId);
    this.assertEditable(doc);
    if (input.action === "answer" && !input.answer?.trim()) throw new BadRequestException("Answer is required");
    const updated = await this.prisma.lensFinding.update({
      where: { id: findingId },
      data:
        input.action === "reopen"
          ? { status: "OPEN", answer: null, resolvedById: null }
          : { status: input.action === "answer" ? "ANSWERED" : "DEFAULT_ACCEPTED", answer: input.action === "answer" ? input.answer!.trim() : f.proposedDefault, resolvedById: user.id },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: `brd.question_${input.action}`, entityType: "lens_finding", entityId: findingId, projectId: doc.projectId, data: { code: f.code } });
    return updated;
  }

  // ---------- Deep Audit and submission ----------

  async runAudit(user: AuthUser, documentId: string) {
    const doc = await this.docForUser(user, documentId);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: doc.projectId } });
    const [reqs, findings] = await Promise.all([
      this.prisma.requirement.findMany({ where: { documentId } }),
      this.prisma.lensFinding.findMany({ where: { documentId } }),
    ]);
    const c = content(doc);
    const ruleFindings = runBrdRuleChecks({
      requirements: reqs.map((r) => ({ code: r.code, description: r.description, type: r.type, citations: r.citations as unknown as Citation[], acceptanceCriteria: r.acceptanceCriteria as unknown as AcceptanceCriterion[], aiDrafted: r.aiDrafted, confirmed: r.confirmed })),
      findings: findings.map((f) => ({ code: f.code, lens: f.lens, severity: f.severity, blocking: f.blocking, status: f.status, question: f.question })),
      document: doc.status === "DRAFTING" ? null : c,
    });
    const runId = randomUUID();
    const { report } = await this.temporal.runDeepAudit({
      runId, tenantId: user.tenantId, projectId: doc.projectId, project: projectContext(project), version: doc.version, document: c,
      requirements: reqs.map((r) => ({ code: r.code, title: r.title, description: r.description, type: r.type, priority: r.priority, citations: r.citations as unknown as Citation[], acceptanceCriteria: r.acceptanceCriteria as unknown as AcceptanceCriterion[], confirmed: r.confirmed })),
      findings: findings.map((f) => ({ code: f.code, lens: f.lens, category: f.category, description: f.description, severity: f.severity, question: f.question, proposedDefault: f.proposedDefault, relatedRequirementCodes: f.relatedRequirementCodes, blocking: f.blocking, status: f.status, answer: f.answer })),
    });
    const aiCritical = report.adversarial_gap_matrix.filter((g) => g.severity === "CRITICAL_BLOCKER").length;
    const status = overallAuditStatus(ruleFindings, report.readiness_assessment.status, aiCritical);
    const criticalCount = aiCritical + ruleFindings.filter((r) => r.severity === "CRITICAL_BLOCKER").length;
    const audit = await this.prisma.deepAudit.create({
      data: { tenantId: user.tenantId, projectId: doc.projectId, documentId, documentVersion: doc.version, status, criticalCount, ruleFindings: ruleFindings as unknown as Prisma.InputJsonValue, aiReport: report as unknown as Prisma.InputJsonValue, createdById: user.id },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "brd.deep_audit", entityType: "document", entityId: documentId, projectId: doc.projectId, data: { status, criticalCount, version: doc.version } });
    return audit;
  }

  async submit(user: AuthUser, documentId: string) {
    const doc = await this.docForUser(user, documentId);
    this.assertEditable(doc);
    const n = unconfirmedCount(content(doc));
    if (n > 0) fail("MSG-GEN-03", HttpStatus.CONFLICT, { n });
    const audit = await this.runAudit(user, documentId);
    if (audit.status === "BLOCKED_HIGH_RISK") {
      return { submitted: false, audit, ...msg("MSG-DOC-01", { n: audit.criticalCount }) };
    }
    await this.prisma.document.update({ where: { id: documentId }, data: { status: "IN_REVIEW", submittedAt: new Date() } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "brd.submitted", entityType: "document", entityId: documentId, projectId: doc.projectId, data: { auditStatus: audit.status } });
    return { submitted: true, audit };
  }

  /** BA Lead decision (blueprint 5.2). Approval needs a non-blocked Deep Audit of this version. */
  async decide(user: AuthUser, documentId: string, input: { decision: "APPROVE" | "CHANGES"; note?: string }) {
    const doc = await this.docForUser(user, documentId);
    if (doc.status !== "IN_REVIEW") throw new ConflictException("Only a BRD in review can be decided");
    if (input.decision === "CHANGES" && !input.note?.trim()) throw new BadRequestException("Say what needs to change");
    if (input.decision === "APPROVE") {
      const audit = await this.prisma.deepAudit.findFirst({ where: { documentId, documentVersion: doc.version }, orderBy: { createdAt: "desc" } });
      if (!audit || audit.status === "BLOCKED_HIGH_RISK") throw new ConflictException("The latest Deep Audit blocks approval (BRD-G11)");
    }
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: input.decision === "APPROVE"
        ? { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), reviewNote: input.note ?? null }
        : { status: "CHANGES_REQUESTED", reviewNote: input.note },
    });
    if (input.decision === "APPROVE") await this.prisma.project.update({ where: { id: doc.projectId }, data: { phase: "CLIENT_SIGNOFF" } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: input.decision === "APPROVE" ? "brd.approved" : "brd.changes_requested", entityType: "document", entityId: documentId, projectId: doc.projectId, data: { version: doc.version, note: input.note ?? "" } });
    return updated;
  }

  // ---------- client sign-off (BA-G03: a Krama check, not part of BA drafting) ----------

  async recordSignoff(user: AuthUser, documentId: string, input: SignoffInput, evidence?: Express.Multer.File) {
    const doc = await this.docForUser(user, documentId);
    if (doc.status !== "APPROVED") throw new ConflictException("Client sign-off can be recorded only for an approved BRD");
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: doc.projectId } });
    let evidenceKey: string | undefined;
    if (evidence) {
      evidenceKey = `${user.tenantId}/${doc.projectId}/signoff/${randomUUID()}-${evidence.originalname.replace(/[^\w.-]/g, "_")}`;
      await this.storage.put(evidenceKey, evidence.buffer, evidence.mimetype);
    }
    const owner = project.clientSignoffOwner.toLowerCase();
    const matchesOwner = owner.includes(input.signedByEmail.toLowerCase()) || owner.includes(input.signedByName.toLowerCase());
    const s = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clientSignoff.create({
        data: { tenantId: user.tenantId, projectId: doc.projectId, documentId, ...input, evidenceKey, evidenceName: evidence?.originalname, recordedById: user.id },
      });
      await tx.document.update({ where: { id: documentId }, data: { status: "CLIENT_SIGNED_OFF" } });
      await tx.project.update({ where: { id: doc.projectId }, data: { phase: "FSD" } });
      return row;
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "brd.client_signoff_recorded", entityType: "document", entityId: documentId, projectId: doc.projectId, data: { signedBy: input.signedByEmail, matchesNamedOwner: matchesOwner, evidence: Boolean(evidence) } });
    return { ...s, matchesNamedOwner: matchesOwner };
  }

  async withdrawSignoff(user: AuthUser, documentId: string, note: string) {
    const doc = await this.docForUser(user, documentId);
    const s = await this.prisma.clientSignoff.findFirst({ where: { documentId, withdrawnAt: null } });
    if (!s) throw new NotFoundException("No active sign-off");
    await this.prisma.$transaction([
      this.prisma.clientSignoff.update({ where: { id: s.id }, data: { withdrawnAt: new Date(), withdrawnNote: note } }),
      this.prisma.document.update({ where: { id: documentId }, data: { status: "APPROVED" } }),
      this.prisma.project.update({ where: { id: doc.projectId }, data: { phase: "CLIENT_SIGNOFF" } }),
    ]);
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "brd.client_signoff_withdrawn", entityType: "document", entityId: documentId, projectId: doc.projectId, data: { note } });
    return { withdrawn: true };
  }

  // ---------- export ----------

  async export(user: AuthUser, documentId: string, format: FileFormat) {
    const doc = await this.docForUser(user, documentId);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: doc.projectId } });
    const [reqs, findings] = await Promise.all([
      this.prisma.requirement.findMany({ where: { documentId }, orderBy: { code: "asc" } }),
      this.prisma.lensFinding.findMany({ where: { documentId }, orderBy: { code: "asc" } }),
    ]);
    const c = content(doc);
    const r: RenderDoc = {
      title: `${project.name} — Business Requirements Document v${doc.version}`,
      subtitle: `${project.clientName} · ${project.code} · Status: ${doc.status.replace(/_/g, " ").toLowerCase()}`,
      meta: [
        ["Project", `${project.name} (${project.code})`],
        ["Client", project.clientName],
        ["Domain", project.domain],
        ["Version", String(doc.version)],
        ["Client sign-off owner", project.clientSignoffOwner],
        ["Generated with", `${(doc.generation as { model?: string }).model ?? "n/a"}; AI-drafted statements are marked`],
      ],
      sections: [
        ...c.sections.map((s, i) => ({
          heading: `${i + 1}. ${s.heading}`,
          blocks: s.statements.length
            ? [{ kind: "bullets" as const, items: s.statements.map((st) => `${st.text}${st.citations.length ? ` [source: ${st.citations[0]!.location ?? "document"}]` : st.confirmed ? " [confirmed by BA]" : " [AI-drafted, unconfirmed]"}`) }]
            : [{ kind: "p" as const, text: "Not applicable.", muted: true }],
        })),
        {
          heading: "Appendix A. Requirement register",
          blocks: [{ kind: "table" as const, head: ["ID", "Requirement", "Priority", "Acceptance criteria"], widths: [10, 45, 10, 35], rows: reqs.map((q) => [q.code, q.description, q.priority, (q.acceptanceCriteria as unknown as AcceptanceCriterion[]).map((a) => `Given ${a.given}, when ${a.when}, then ${a.then}`).join(" ") || "—"]) }],
        },
        {
          heading: "Appendix B. Questions for the client",
          blocks: [{ kind: "table" as const, head: ["ID", "Lens", "Question", "Proposed default", "Status"], widths: [8, 8, 34, 34, 16], rows: findings.map((f) => [f.code, f.lens, f.question, f.answer ?? f.proposedDefault, f.status.replace(/_/g, " ").toLowerCase()]) }],
        },
      ],
      footer: footerText({ project: project.code, version: `BRD v${doc.version}`, user: user.email }),
    };
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "document.downloaded", entityType: "document", entityId: documentId, projectId: doc.projectId, data: { format, version: doc.version } });
    const name = `${project.code}_BRD_v${doc.version}`;
    return renderFile(r, name, format);
  }
}
