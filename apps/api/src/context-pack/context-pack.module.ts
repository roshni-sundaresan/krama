import { ConflictException, Controller, Get, Injectable, Module, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { ContextPack } from "@krama/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { GuardrailsService } from "../guardrails/guardrails.service.js";
import { CurrentUser, Roles, type AuthUser } from "../common/auth-user.js";
import { toDepthMode } from "../common/mappers.js";
import { buildContextPack, type PackRequirement } from "./context-pack.builder.js";

@Injectable()
export class ContextPackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsService,
    private readonly guardrails: GuardrailsService,
  ) {}

  async build(user: AuthUser, projectId: string): Promise<ContextPack> {
    const project = await this.projects.getOrThrow(user.tenantId, projectId);
    if (project.phase !== "BUILD") {
      throw new ConflictException("Context pack is available once requirements and documents are approved (phase BUILD)");
    }
    const [requirements, decisions, effective] = await Promise.all([
      this.prisma.requirement.findMany({
        where: { tenantId: user.tenantId, projectId, status: "APPROVED" },
        orderBy: { code: "asc" },
      }),
      this.prisma.decision.findMany({ where: { tenantId: user.tenantId, projectId }, orderBy: { number: "asc" } }),
      this.guardrails.effectiveForProject(user.tenantId, projectId),
    ]);
    const pack = buildContextPack({
      project: { ...project, depthMode: toDepthMode(project.depthMode) },
      requirements: requirements.map((r) => ({ ...r, citations: r.citations as unknown as PackRequirement["citations"] })),
      decisions,
      guardrails: effective.guardrails,
      exceptions: effective.exceptions,
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      action: "context_pack.downloaded",
      entityType: "project",
      entityId: projectId,
      data: { requirements: requirements.length, guardrailsVersion: effective.guardrails.version },
    });
    return pack;
  }
}

@ApiTags("context-pack")
@ApiBearerAuth()
@Controller("projects/:projectId/context-pack")
export class ContextPackController {
  constructor(private readonly packs: ContextPackService) {}

  /** JSON bundle consumed by `krama pull`; `files` can be zipped as-is. */
  @Get()
  @Roles("Developer", "LeadArchitect")
  get(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.packs.build(user, projectId);
  }
}

@Module({ controllers: [ContextPackController], providers: [ContextPackService] })
export class ContextPackModule {}
