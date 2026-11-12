import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { CurrentUser, Roles, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";

const UpdateGapSchema = z.object({ status: z.enum(["OPEN", "RESOLVED", "ACCEPTED"]) });

@Injectable()
export class GapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser, projectId: string) {
    return this.prisma.gap.findMany({
      where: { tenantId: user.tenantId, projectId, status: { not: "SUPERSEDED" } },
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    });
  }

  async update(user: AuthUser, projectId: string, gapId: string, status: "OPEN" | "RESOLVED" | "ACCEPTED") {
    const gap = await this.prisma.gap.findFirst({ where: { id: gapId, projectId, tenantId: user.tenantId } });
    if (!gap) throw new NotFoundException("Gap not found");
    const updated = await this.prisma.gap.update({ where: { id: gapId }, data: { status } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "gap.status_changed", entityType: "gap", entityId: gapId, data: { from: gap.status, to: status } });
    return updated;
  }
}

@ApiTags("gaps")
@ApiBearerAuth()
@Controller("projects/:projectId/gaps")
export class GapsController {
  constructor(private readonly gaps: GapsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.gaps.list(user, projectId);
  }

  @Patch(":gapId")
  @Roles("BA")
  update(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Param("gapId") gapId: string,
    @Body(new ZodPipe(UpdateGapSchema)) body: z.infer<typeof UpdateGapSchema>,
  ) {
    return this.gaps.update(user, projectId, gapId, body.status);
  }
}

@Module({ controllers: [GapsController], providers: [GapsService] })
export class GapsModule {}
