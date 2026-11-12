import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Approval, ApprovalStatus, ArtefactStatus } from "@prisma/client";
import {
  APPROVER_ROLES,
  GUARDRAIL_ADMIN_ROLES,
  hasAnyRole,
  type ApprovalDto,
  type DecideApprovalInput,
} from "@krama/shared";
import type { GateSignal } from "@krama/workflows";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { TemporalService } from "../temporal/temporal.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import type { AuthUser } from "../common/auth-user.js";

const GATE_STAGE = {
  REQUIREMENTS: "AWAITING_REQUIREMENTS_APPROVAL",
  DOCUMENTS: "AWAITING_DOCUMENTS_APPROVAL",
} as const;

const DECISION_STATUS: Record<DecideApprovalInput["decision"], ApprovalStatus> = {
  APPROVE: "APPROVED",
  RETURN: "RETURNED",
  REJECT: "REJECTED",
};

const ARTEFACT_STATUS: Record<DecideApprovalInput["decision"], ArtefactStatus> = {
  APPROVE: "APPROVED",
  RETURN: "RETURNED",
  REJECT: "REJECTED",
};

type WithRequester = Approval & { requestedBy: { id: string; name: string } };

function toDto(a: WithRequester): ApprovalDto {
  return {
    id: a.id,
    projectId: a.projectId,
    subjectType: a.subjectType,
    subjectId: a.subjectId,
    status: a.status,
    summary: a.summary,
    requestedBy: a.requestedBy,
    comments: a.comments,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Pure policy check, exported for unit tests. */
export function assertCanDecide(user: AuthUser, approval: Pick<Approval, "subjectType" | "requestedById" | "status">): void {
  if (approval.status !== "PENDING") throw new ConflictException(`Approval already ${approval.status}`);
  const allowed = approval.subjectType === "EXCEPTION" ? GUARDRAIL_ADMIN_ROLES : APPROVER_ROLES;
  if (!hasAnyRole(user.roles, allowed)) throw new ForbiddenException(`Requires one of: ${allowed.join(", ")}`);
  // Separation of duties: nobody approves their own request.
  if (approval.requestedById === user.id) throw new ForbiddenException("You cannot decide your own request");
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly temporal: TemporalService,
    private readonly projects: ProjectsService,
  ) {}

  async list(user: AuthUser, opts: { status?: ApprovalStatus; projectId?: string }) {
    const rows = await this.prisma.approval.findMany({
      where: { tenantId: user.tenantId, status: opts.status, projectId: opts.projectId },
      include: { requestedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(toDto);
  }

  /** BA submits the current requirements / document drafts of the active run for approval. */
  async submitGate(user: AuthUser, projectId: string, subject: "REQUIREMENTS" | "DOCUMENTS") {
    const project = await this.projects.getOrThrow(user.tenantId, projectId);
    const run = await this.prisma.workflowRun.findFirst({
      where: { tenantId: user.tenantId, projectId, status: "WAITING", stage: GATE_STAGE[subject] },
      orderBy: { startedAt: "desc" },
    });
    if (!run) throw new ConflictException(`No run is waiting for ${subject.toLowerCase()} approval`);
    const pending = await this.prisma.approval.findFirst({
      where: { tenantId: user.tenantId, subjectType: subject, subjectId: run.id, status: "PENDING" },
    });
    if (pending) throw new ConflictException("Already submitted and pending approval");

    const approval = await this.prisma.$transaction(async (tx) => {
      if (subject === "REQUIREMENTS") {
        await tx.requirement.updateMany({ where: { tenantId: user.tenantId, projectId, status: "DRAFT" }, data: { status: "IN_REVIEW" } });
      } else {
        await tx.document.updateMany({ where: { tenantId: user.tenantId, projectId, status: "DRAFT" }, data: { status: "IN_REVIEW" } });
      }
      const a = await tx.approval.create({
        data: {
          tenantId: user.tenantId,
          projectId,
          subjectType: subject,
          subjectId: run.id,
          runId: run.id,
          summary: `${subject === "REQUIREMENTS" ? "Requirements" : "BRD / SOW / FSD drafts"} for ${project.name}`,
          requestedById: user.id,
        },
      });
      await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "approval.requested", entityType: "approval", entityId: a.id, data: { subject, runId: run.id } }, tx);
      return a;
    });
    return approval;
  }

  async decide(user: AuthUser, approvalId: string, input: DecideApprovalInput) {
    const approval = await this.prisma.approval.findFirst({ where: { id: approvalId, tenantId: user.tenantId } });
    if (!approval) throw new NotFoundException("Approval not found");
    assertCanDecide(user, approval);
    if (input.decision !== "APPROVE" && !input.comments?.trim()) {
      throw new BadRequestException("Comments are required when returning or rejecting");
    }

    if (approval.subjectType === "EXCEPTION") {
      await this.decideException(user, approval, input);
    } else {
      await this.decideGate(user, approval, input);
    }

    const updated = await this.prisma.approval.update({
      where: { id: approval.id },
      data: { status: DECISION_STATUS[input.decision], decidedById: user.id, decidedAt: new Date(), comments: input.comments },
      include: { requestedBy: { select: { id: true, name: true } } },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      action: `approval.${input.decision.toLowerCase()}`,
      entityType: "approval",
      entityId: approval.id,
      data: { subjectType: approval.subjectType, subjectId: approval.subjectId, comments: input.comments ?? null },
    });
    return toDto(updated);
  }

  private async decideGate(user: AuthUser, approval: Approval, input: DecideApprovalInput) {
    const run = await this.prisma.workflowRun.findFirst({ where: { id: approval.subjectId, tenantId: user.tenantId } });
    if (!run?.temporalWorkflowId) throw new ConflictException("Workflow run not found or not started");
    const subject = approval.subjectType as "REQUIREMENTS" | "DOCUMENTS";

    const signal: GateSignal =
      input.decision === "APPROVE"
        ? { name: subject === "REQUIREMENTS" ? "approveRequirements" : "approveDocuments", payload: { approvedBy: user.id, comments: input.comments } }
        : input.decision === "RETURN"
          ? { name: "returnWithComments", payload: { by: user.id, comments: input.comments ?? "" } }
          : { name: "reject", payload: { by: user.id, reason: input.comments ?? "" } };

    // Signal first: if Temporal is unreachable, nothing is changed and the approver can retry.
    await this.temporal.signal(run.temporalWorkflowId, signal);

    const status: ArtefactStatus = ARTEFACT_STATUS[input.decision];
    const where = { tenantId: user.tenantId, projectId: run.projectId, status: "IN_REVIEW" as const };
    if (subject === "REQUIREMENTS") await this.prisma.requirement.updateMany({ where, data: { status } });
    else await this.prisma.document.updateMany({ where, data: { status } });
  }

  private async decideException(user: AuthUser, approval: Approval, input: DecideApprovalInput) {
    const ex = await this.prisma.guardrailException.findFirst({ where: { id: approval.subjectId, tenantId: user.tenantId } });
    if (!ex) throw new NotFoundException("Exception request not found");
    if (input.decision === "APPROVE") {
      const rule = await this.prisma.guardrailRule.findFirst({
        where: { tenantId: user.tenantId, key: ex.ruleKey, ruleSet: { isActive: true } },
      });
      if (!rule) throw new ConflictException(`Rule ${ex.ruleKey} is not in the active guardrail set`);
      if (rule.nonWaivable) throw new ForbiddenException(`Rule ${ex.ruleKey} is non-waivable`);
      if (ex.expiresAt <= new Date()) throw new ConflictException("Exception expiry is in the past");
    }
    await this.prisma.guardrailException.update({
      where: { id: ex.id },
      data: {
        status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: input.comments,
      },
    });
  }
}
