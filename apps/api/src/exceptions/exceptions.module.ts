import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequestExceptionSchema, type RequestExceptionInput } from "@krama/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { GuardrailsService } from "../guardrails/guardrails.service.js";
import { CurrentUser, Roles, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";

export const MAX_EXCEPTION_DAYS = 180;

@Injectable()
export class ExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsService,
    private readonly guardrails: GuardrailsService,
  ) {}

  list(user: AuthUser, projectId?: string) {
    return this.prisma.guardrailException.findMany({
      where: { tenantId: user.tenantId, projectId },
      include: { requestedBy: { select: { id: true, name: true } }, decidedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Developers cannot override guardrails; they request an exception for Lead Architect approval. */
  async request(user: AuthUser, input: RequestExceptionInput, now = new Date()) {
    const project = await this.projects.getOrThrow(user.tenantId, input.projectId);
    const ruleSet = await this.guardrails.getActive(user.tenantId);
    const rule = ruleSet.rules.find((r) => r.key === input.ruleId);
    if (!rule) throw new BadRequestException(`Unknown rule ${input.ruleId}`);
    if (rule.nonWaivable) throw new ForbiddenException(`Rule ${rule.key} is non-waivable; exceptions are not possible`);
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= now) throw new BadRequestException("Expiry must be in the future");
    if (expiresAt.getTime() - now.getTime() > MAX_EXCEPTION_DAYS * 86_400_000) {
      throw new BadRequestException(`Expiry may be at most ${MAX_EXCEPTION_DAYS} days ahead`);
    }
    if (input.scope === "change" && !input.changeRef) {
      throw new BadRequestException("changeRef (branch or PR) is required for change-scoped exceptions");
    }

    return this.prisma.$transaction(async (tx) => {
      const ex = await tx.guardrailException.create({
        data: {
          tenantId: user.tenantId,
          projectId: project.id,
          ruleKey: rule.key,
          reason: input.reason,
          scope: input.scope === "change" ? "CHANGE" : "PROJECT",
          changeRef: input.changeRef,
          paths: input.paths,
          expiresAt,
          requestedById: user.id,
        },
      });
      await tx.approval.create({
        data: {
          tenantId: user.tenantId,
          projectId: project.id,
          subjectType: "EXCEPTION",
          subjectId: ex.id,
          summary: `Exception to "${rule.name}" (${input.scope}) on ${project.name}: ${input.reason.slice(0, 120)}`,
          requestedById: user.id,
        },
      });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.id, action: "exception.requested", entityType: "guardrail_exception", entityId: ex.id, data: { ruleKey: rule.key, scope: input.scope, expiresAt: input.expiresAt } },
        tx,
      );
      return ex;
    });
  }
}

@ApiTags("exceptions")
@ApiBearerAuth()
@Controller("exceptions")
export class ExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.exceptions.list(user, projectId);
  }

  @Post()
  @Roles("Developer", "LeadArchitect")
  request(@CurrentUser() user: AuthUser, @Body(new ZodPipe(RequestExceptionSchema)) body: RequestExceptionInput) {
    return this.exceptions.request(user, body);
  }
}

@Module({ controllers: [ExceptionsController], providers: [ExceptionsService] })
export class ExceptionsModule {}
