import { Controller, Get, Injectable, Module, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { ApprovalsService } from "../approvals/approvals.service.js";
import { CurrentUser, Roles, type AuthUser } from "../common/auth-user.js";

@Injectable()
export class RequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current requirements (latest iteration); `all=true` includes superseded history. */
  list(user: AuthUser, projectId: string, includeHistory = false) {
    return this.prisma.requirement.findMany({
      where: { tenantId: user.tenantId, projectId, status: includeHistory ? undefined : { not: "SUPERSEDED" } },
      orderBy: [{ iteration: "desc" }, { code: "asc" }],
    });
  }
}

@ApiTags("requirements")
@ApiBearerAuth()
@Controller("projects/:projectId/requirements")
export class RequirementsController {
  constructor(
    private readonly requirements: RequirementsService,
    private readonly approvals: ApprovalsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Query("all") all?: string) {
    return this.requirements.list(user, projectId, all === "true");
  }

  /** BA review done → submit to an Approver. */
  @Post("submit")
  @Roles("BA")
  submit(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.approvals.submitGate(user, projectId, "REQUIREMENTS");
  }
}

@Module({ controllers: [RequirementsController], providers: [RequirementsService] })
export class RequirementsModule {}
