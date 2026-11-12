import { Injectable, NotFoundException } from "@nestjs/common";
import type { Project } from "@prisma/client";
import { CODING_TOOLS, type CreateProjectInput, type DepthMode, type ProjectDto } from "@krama/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { fromDepthMode, toDepthMode } from "../common/mappers.js";
import type { AuthUser } from "../common/auth-user.js";

export function toProjectDto(p: Project): ProjectDto & { approvedTools: string[] } {
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    description: p.description ?? undefined,
    clientWork: p.clientWork,
    clientName: p.clientName ?? undefined,
    projectType: p.projectType,
    technology: p.technology,
    depthMode: toDepthMode(p.depthMode),
    targetPlatforms: p.targetPlatforms,
    phase: p.phase,
    approvedTools: p.approvedTools,
    createdAt: p.createdAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const projects = await this.prisma.project.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { updatedAt: "desc" },
    });
    return projects.map(toProjectDto);
  }

  /** Tenant-scoped lookup used by every project-bound module. */
  async getOrThrow(tenantId: string, id: string): Promise<Project> {
    const p = await this.prisma.project.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException("Project not found");
    return p;
  }

  async get(user: AuthUser, id: string) {
    return toProjectDto(await this.getOrThrow(user.tenantId, id));
  }

  async create(user: AuthUser, input: CreateProjectInput) {
    const p = await this.prisma.project.create({
      data: {
        tenantId: user.tenantId,
        name: input.name,
        description: input.description,
        clientWork: input.clientWork,
        clientName: input.clientName,
        projectType: input.projectType,
        technology: input.technology,
        depthMode: fromDepthMode(input.depthMode),
        targetPlatforms: input.targetPlatforms,
        createdById: user.id,
      },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "project.created", entityType: "project", entityId: p.id, data: { name: p.name } });
    return toProjectDto(p);
  }

  async updateSettings(user: AuthUser, id: string, input: { depthMode?: DepthMode; approvedTools?: string[] }) {
    await this.getOrThrow(user.tenantId, id);
    const approvedTools = input.approvedTools?.filter((t) => (CODING_TOOLS as readonly string[]).includes(t));
    const p = await this.prisma.project.update({
      where: { id },
      data: { depthMode: input.depthMode ? fromDepthMode(input.depthMode) : undefined, approvedTools },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "project.settings_updated", entityType: "project", entityId: id, data: input });
    return toProjectDto(p);
  }

  listDecisions(user: AuthUser, projectId: string) {
    return this.prisma.decision.findMany({ where: { tenantId: user.tenantId, projectId }, orderBy: { number: "asc" } });
  }

  async addDecision(
    user: AuthUser,
    projectId: string,
    input: { title: string; context: string; decision: string; consequences: string },
  ) {
    await this.getOrThrow(user.tenantId, projectId);
    const last = await this.prisma.decision.findFirst({ where: { projectId }, orderBy: { number: "desc" } });
    const d = await this.prisma.decision.create({
      data: { tenantId: user.tenantId, projectId, number: (last?.number ?? 0) + 1, status: "ACCEPTED", createdById: user.id, ...input },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "decision.recorded", entityType: "decision", entityId: d.id, data: { number: d.number, title: d.title } });
    return d;
  }
}
