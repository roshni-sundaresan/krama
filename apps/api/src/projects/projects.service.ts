import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Project } from "@prisma/client";
import { can, PHASE_LABELS, PHASES, type CreateProjectInput, type Phase } from "@krama/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthUser } from "../common/auth-user.js";

export type StepState = "done" | "active" | "waiting" | "locked" | "later";
export interface PipelineStep {
  phase: Phase;
  label: string;
  state: StepState;
  status: string;
}

type ProjectWithState = Project & {
  documents: { type: string; status: string; version: number }[];
  signoffs: { withdrawnAt: Date | null }[];
  packs: { status: string; version: number }[];
};

const latest = <T extends { version: number }>(xs: T[]) => xs.reduce<T | undefined>((a, b) => (!a || b.version > a.version ? b : a), undefined);

/** Gate state per phase, computed from records (projects overview, FSD section 4). */
export function pipelineOf(p: ProjectWithState): PipelineStep[] {
  const brd = latest(p.documents.filter((d) => d.type === "BRD"));
  const signedOff = p.signoffs.some((s) => !s.withdrawnAt);
  const brdApproved = brd?.status === "APPROVED" || brd?.status === "CLIENT_SIGNED_OFF";
  const pack = latest(p.packs);
  const packApproved = p.packs.some((x) => x.status === "APPROVED");
  const s = (phase: Phase, state: StepState, status: string): PipelineStep => ({ phase, label: PHASE_LABELS[phase], state, status });
  const brdStatus: Record<string, [StepState, string]> = {
    DRAFTING: ["active", "Drafting"],
    DRAFT: ["active", "Draft"],
    IN_REVIEW: ["waiting", "BA Lead review"],
    CHANGES_REQUESTED: ["active", "Changes requested"],
    APPROVED: ["done", "Approved"],
    CLIENT_SIGNED_OFF: ["done", "Signed off"],
  };
  return [
    s("INTAKE", brd ? "done" : "active", brd ? "Done" : "In progress"),
    brd ? s("BRD", ...(brdStatus[brd.status] ?? ["active", brd.status])) : s("BRD", "locked", "Not started"),
    signedOff ? s("CLIENT_SIGNOFF", "done", "Signed off") : brdApproved ? s("CLIENT_SIGNOFF", "waiting", "Sign-off check") : s("CLIENT_SIGNOFF", "locked", "Locked"),
    s("FSD", signedOff ? "later" : "locked", signedOff ? "Next release" : "Locked"),
    s("DESIGN", signedOff ? "later" : "locked", signedOff ? "Next release" : "Locked"),
    s("API_SPEC", signedOff ? "later" : "locked", signedOff ? "Next release" : "Locked"),
    packApproved
      ? s("STACK", "done", "Pack approved")
      : pack?.status === "SUBMITTED"
        ? s("STACK", "waiting", "Pack approval")
        : brdApproved
          ? s("STACK", "active", p.stackKey ? "Stack selected" : "Select stack")
          : s("STACK", "locked", "Locked"),
    s("DEVELOPMENT", packApproved ? "active" : "locked", packApproved ? "In progress" : "Locked"),
    s("TESTING", "later", "Next release"),
  ];
}

export function currentPhase(steps: PipelineStep[]): Phase {
  const order = PHASES.filter((ph) => ph !== "FSD" && ph !== "DESIGN" && ph !== "API_SPEC" && ph !== "TESTING");
  let cur: Phase = "INTAKE";
  for (const ph of order) {
    const st = steps.find((x) => x.phase === ph);
    if (st && st.state !== "locked") cur = ph;
  }
  return cur;
}

const STATE_INCLUDE = {
  documents: { select: { type: true, status: true, version: true } },
  signoffs: { select: { withdrawnAt: true } },
  packs: { select: { status: true, version: true } },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Projects a user may see: all for Tech Architects, otherwise assigned or created (BRD-RBAC-05, section 14). */
  visibleWhere(user: AuthUser): Prisma.ProjectWhereInput {
    if (can(user.roles, "project.viewAll")) return { tenantId: user.tenantId };
    return { tenantId: user.tenantId, OR: [{ createdById: user.id }, { members: { some: { userId: user.id } } }] };
  }

  /** Throws "not found" for projects the user may not see, so their existence is not revealed. */
  async getOrThrow(user: AuthUser, projectId: string): Promise<Project> {
    const p = await this.prisma.project.findFirst({ where: { AND: [{ id: projectId }, this.visibleWhere(user)] } });
    if (!p) throw new NotFoundException("Project not found");
    return p;
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.project.findMany({
      where: this.visibleWhere(user),
      orderBy: { updatedAt: "desc" },
      include: { ...STATE_INCLUDE, members: { select: { user: { select: { name: true, roles: true } } } } },
    });
    return rows.map((p) => {
      const pipeline = pipelineOf(p);
      const phase = currentPhase(pipeline);
      const ba = p.members.find((m) => (m.user.roles as string[]).includes("BA"))?.user.name ?? null;
      return {
        id: p.id, code: p.code, name: p.name, clientName: p.clientName, domain: p.domain, platforms: p.platforms,
        status: p.status, pipeline, phase, phaseLabel: PHASE_LABELS[phase], gate: pipeline.find((x) => x.phase === phase)?.status ?? "", ba,
      };
    });
  }

  async get(user: AuthUser, projectId: string) {
    await this.getOrThrow(user, projectId);
    const p = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { ...STATE_INCLUDE, members: { include: { user: { select: { id: true, name: true, email: true, roles: true } } } } },
    });
    const pipeline = pipelineOf(p);
    return { ...p, pipeline, currentPhase: currentPhase(pipeline) };
  }

  async create(user: AuthUser, input: CreateProjectInput) {
    const exists = await this.prisma.project.findUnique({ where: { tenantId_code: { tenantId: user.tenantId, code: input.code } } });
    if (exists) throw new ForbiddenException(`Project code ${input.code} is already used`);
    const project = await this.prisma.project.create({
      data: {
        tenantId: user.tenantId,
        ...input,
        entityType: input.domain === "GENERAL" ? null : (input.entityType ?? null),
        createdById: user.id,
        members: { create: { tenantId: user.tenantId, userId: user.id, addedById: user.id } },
      },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "project.created", entityType: "project", entityId: project.id, projectId: project.id, data: { code: input.code, domain: input.domain } });
    return project;
  }

  async updateIntake(user: AuthUser, projectId: string, input: Partial<CreateProjectInput>) {
    const p = await this.getOrThrow(user, projectId);
    if (p.domainConfirmed && input.domain && input.domain !== p.domain)
      throw new ForbiddenException("The domain is confirmed by the Tech Architect; ask them to change it");
    const { code: _code, ...rest } = input;
    const updated = await this.prisma.project.update({ where: { id: projectId }, data: rest });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "project.intake_updated", entityType: "project", entityId: projectId, projectId, data: { fields: Object.keys(rest) } });
    return updated;
  }

  async addMember(user: AuthUser, projectId: string, userId: string) {
    await this.getOrThrow(user, projectId);
    const target = await this.prisma.user.findFirst({ where: { id: userId, tenantId: user.tenantId, active: true } });
    if (!target) throw new NotFoundException("User not found");
    const m = await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { tenantId: user.tenantId, projectId, userId, addedById: user.id },
      update: {},
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "project.member_assigned", entityType: "project", entityId: projectId, projectId, data: { userId, email: target.email } });
    return m;
  }

  async removeMember(user: AuthUser, projectId: string, userId: string) {
    await this.getOrThrow(user, projectId);
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "project.member_removed", entityType: "project", entityId: projectId, projectId, data: { userId } });
  }

  async activity(user: AuthUser, projectId: string) {
    await this.getOrThrow(user, projectId);
    const rows = await this.prisma.auditLog.findMany({ where: { tenantId: user.tenantId, projectId, NOT: { action: { startsWith: "http." } } }, orderBy: { createdAt: "desc" }, take: 100 });
    const actors = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const names = new Map(actors.map((a) => [a.id, a.name]));
    return rows.map((r) => ({ ...r, actorName: r.actorId ? (names.get(r.actorId) ?? "") : "Krama" }));
  }

  /** "Waiting on you" items and summary counts for the projects overview. */
  async inbox(user: AuthUser) {
    const where = this.visibleWhere(user);
    const items: { role: string; title: string; projectId: string; projectCode: string; href: string }[] = [];
    const projects = await this.prisma.project.findMany({ where, include: STATE_INCLUDE });
    const byId = new Map(projects.map((p) => [p.id, p]));
    if (can(user.roles, "brd.approve")) {
      const docs = await this.prisma.document.findMany({ where: { project: where, type: "BRD", status: "IN_REVIEW" } });
      for (const d of docs) items.push({ role: "BA Lead", title: `Approve BRD v${d.version}`, projectId: d.projectId, projectCode: byId.get(d.projectId)?.code ?? "", href: `/projects/${d.projectId}/audit` });
    }
    if (can(user.roles, "pack.approve")) {
      const packs = await this.prisma.guardrailPack.findMany({ where: { project: where, status: "SUBMITTED" } });
      for (const pk of packs) items.push({ role: "Tech Architect", title: `Approve guardrails pack v${pk.version}`, projectId: pk.projectId, projectCode: byId.get(pk.projectId)?.code ?? "", href: `/projects/${pk.projectId}/stack` });
      for (const p of projects) {
        const steps = pipelineOf(p);
        if (steps.find((x) => x.phase === "STACK")?.status === "Select stack")
          items.push({ role: "Tech Architect", title: "Select tech stack and confirm domain", projectId: p.id, projectCode: p.code, href: `/projects/${p.id}/stack` });
      }
    }
    if (can(user.roles, "exception.decide")) {
      const ex = await this.prisma.guardrailException.findMany({ where: { project: where, status: "REQUESTED" } });
      for (const e of ex) items.push({ role: "Tech Architect", title: `Exception request on ${e.ruleId}`, projectId: e.projectId, projectCode: byId.get(e.projectId)?.code ?? "", href: `/projects/${e.projectId}/development` });
    }
    if (can(user.roles, "checklist.confirm")) {
      for (const p of projects) {
        const approved = p.packs.filter((x) => x.status === "APPROVED").sort((a, b) => b.version - a.version)[0];
        if (!approved) continue;
        const done = await this.prisma.checklistConfirmation.findFirst({ where: { projectId: p.id, userId: user.id, packVersion: approved.version } });
        if (!done) items.push({ role: "Developer", title: "Confirm the software checklist", projectId: p.id, projectCode: p.code, href: `/projects/${p.id}/development` });
      }
    }
    if (can(user.roles, "brd.draft")) {
      const docs = await this.prisma.document.findMany({ where: { project: where, type: "BRD", status: "CHANGES_REQUESTED" } });
      for (const d of docs) items.push({ role: "BA", title: `Address BA Lead comments on BRD v${d.version}`, projectId: d.projectId, projectCode: byId.get(d.projectId)?.code ?? "", href: `/projects/${d.projectId}/brd` });
    }
    const openQuestions = await this.prisma.lensFinding.count({ where: { project: where, status: "OPEN" } });
    const blocked = projects.filter((p) => pipelineOf(p).some((s) => s.state === "waiting")).length;
    return { items, summary: { active: projects.filter((p) => p.status === "ACTIVE").length, waiting: items.length, gates: blocked, openQuestions } };
  }
}
