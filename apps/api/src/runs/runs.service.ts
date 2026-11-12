import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ProjectPhase, RunStatus } from "@prisma/client";
import { DOCUMENT_TYPES } from "@krama/shared";
import type { RunEvent, RunStage, TokenUsageRecord } from "@krama/workflows";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { TemporalService } from "../temporal/temporal.service.js";
import type { AuthUser } from "../common/auth-user.js";

const STAGE_STATUS: Record<RunStage, RunStatus> = {
  EXTRACTING: "RUNNING",
  DRAFTING: "RUNNING",
  AWAITING_REQUIREMENTS_APPROVAL: "WAITING",
  AWAITING_DOCUMENTS_APPROVAL: "WAITING",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
};
const STAGE_PHASE: Partial<Record<RunStage, ProjectPhase>> = {
  AWAITING_REQUIREMENTS_APPROVAL: "REQUIREMENTS",
  DRAFTING: "DOCUMENTS",
  COMPLETED: "BUILD",
};

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsService,
    private readonly temporal: TemporalService,
  ) {}

  list(user: AuthUser, projectId: string) {
    return this.prisma.workflowRun.findMany({
      where: { tenantId: user.tenantId, projectId },
      orderBy: { startedAt: "desc" },
      select: { id: true, workflowType: true, status: true, stage: true, startedAt: true, finishedAt: true, error: true, temporalWorkflowId: true },
    });
  }

  async get(tenantId: string, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException("Run not found");
    return run;
  }

  /** Start the Documentation capability for a project (one active run at a time). */
  async startDocumentation(user: AuthUser, projectId: string) {
    const project = await this.projects.getOrThrow(user.tenantId, projectId);
    const active = await this.prisma.workflowRun.findFirst({
      where: { tenantId: user.tenantId, projectId, status: { in: ["RUNNING", "WAITING"] } },
    });
    if (active) throw new ConflictException(`Run ${active.id} is still in progress (${active.stage})`);
    const sources = await this.prisma.sourceItem.findMany({
      where: { tenantId: user.tenantId, projectId, text: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    if (sources.length === 0) throw new BadRequestException("Add at least one text source (upload or iDhi import) first");

    const run = await this.prisma.workflowRun.create({
      data: {
        tenantId: user.tenantId,
        projectId,
        workflowType: "documentationWorkflow",
        startedById: user.id,
        input: { sourceItemIds: sources.map((s) => s.id) },
      },
    });
    try {
      const workflowId = await this.temporal.startDocumentation({
        tenantId: user.tenantId,
        projectId,
        projectName: project.name,
        runId: run.id,
        sources: sources.map((s) => ({ id: s.id, title: s.title, kind: s.kind, text: s.text ?? "" })),
        documentTypes: [...DOCUMENT_TYPES],
      });
      await this.prisma.workflowRun.update({ where: { id: run.id }, data: { temporalWorkflowId: workflowId } });
    } catch (err) {
      await this.prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
      });
      throw err;
    }
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "run.started", entityType: "workflow_run", entityId: run.id, data: { workflowType: run.workflowType, sources: sources.length } });
    return this.get(user.tenantId, run.id);
  }

  /** Callback from the TS worker (orchestration activity). Persists artefacts produced by capabilities. */
  async recordEvent(runId: string, event: RunEvent): Promise<void> {
    const run = await this.prisma.workflowRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException("Run not found");
    const { tenantId, projectId } = run;

    await this.prisma.$transaction(async (tx) => {
      const audit = (action: string, data: Prisma.InputJsonValue) =>
        this.audit.record({ tenantId, actorType: "worker", action, entityType: "workflow_run", entityId: runId, data }, tx);

      switch (event.type) {
        case "stage": {
          const status = STAGE_STATUS[event.stage];
          const done = status === "COMPLETED" || status === "REJECTED";
          await tx.workflowRun.update({
            where: { id: runId },
            data: { stage: event.stage, status, finishedAt: done ? new Date() : undefined },
          });
          const phase = STAGE_PHASE[event.stage];
          if (phase) await tx.project.update({ where: { id: projectId }, data: { phase } });
          await audit("run.stage_changed", { stage: event.stage, note: event.note ?? null });
          break;
        }
        case "requirements": {
          await tx.requirement.updateMany({
            where: { tenantId, projectId, status: { in: ["DRAFT", "RETURNED", "IN_REVIEW"] } },
            data: { status: "SUPERSEDED" },
          });
          await tx.requirement.createMany({
            data: event.requirements.map((r) => ({
              tenantId,
              projectId,
              runId,
              iteration: event.iteration,
              code: r.code,
              title: r.title,
              description: r.description,
              type: r.type,
              priority: r.priority,
              citations: r.citations,
            })),
          });
          await this.recordUsage(tx, tenantId, projectId, runId, event.usage);
          await audit("requirements.extracted", { iteration: event.iteration, count: event.requirements.length });
          break;
        }
        case "gaps": {
          await tx.gap.updateMany({ where: { tenantId, projectId, status: "OPEN" }, data: { status: "SUPERSEDED" } });
          await tx.gap.createMany({
            data: event.gaps.map((g) => ({
              tenantId,
              projectId,
              runId,
              iteration: event.iteration,
              category: g.category,
              description: g.description,
              severity: g.severity,
              relatedRequirementCodes: g.relatedRequirementCodes,
            })),
          });
          await this.recordUsage(tx, tenantId, projectId, runId, event.usage);
          await audit("gaps.reported", { iteration: event.iteration, count: event.gaps.length });
          break;
        }
        case "document": {
          const last = await tx.document.findFirst({
            where: { projectId, type: event.documentType },
            orderBy: { version: "desc" },
          });
          await tx.document.updateMany({
            where: { tenantId, projectId, type: event.documentType, status: { in: ["DRAFT", "RETURNED", "IN_REVIEW"] } },
            data: { status: "SUPERSEDED" },
          });
          const doc = await tx.document.create({
            data: {
              tenantId,
              projectId,
              runId,
              type: event.documentType,
              version: (last?.version ?? 0) + 1,
              content: event.document,
            },
          });
          await this.recordUsage(tx, tenantId, projectId, runId, event.usage);
          await audit("document.drafted", { documentId: doc.id, type: doc.type, version: doc.version });
          break;
        }
      }
    });
  }

  private async recordUsage(
    tx: Prisma.TransactionClient,
    tenantId: string,
    projectId: string,
    runId: string,
    usage: TokenUsageRecord[],
  ): Promise<void> {
    if (!usage.length) return;
    await tx.tokenUsage.createMany({
      data: usage.map((u) => ({
        tenantId,
        projectId,
        runId,
        provider: u.provider,
        modelId: u.modelId,
        tier: u.tier,
        task: u.task,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        costUsd: u.costUsd,
      })),
    });
  }

  async usageSummary(user: AuthUser, projectId: string) {
    const rows = await this.prisma.tokenUsage.groupBy({
      by: ["tier", "modelId"],
      where: { tenantId: user.tenantId, projectId },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
    });
    return rows.map((r) => ({
      tier: r.tier,
      modelId: r.modelId,
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      costUsd: Number(r._sum.costUsd ?? 0),
    }));
  }
}
