import { Body, Controller, Get, Global, HttpCode, Module, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { ApprovalStatus } from "@prisma/client";
import { DecideApprovalSchema, type DecideApprovalInput } from "@krama/shared";
import { CurrentUser, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ApprovalsService } from "./approvals.service.js";

@ApiTags("approvals")
@ApiBearerAuth()
@Controller("approvals")
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  /** Approvals inbox (requirements, documents, guardrail exceptions). */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("status") status?: ApprovalStatus, @Query("projectId") projectId?: string) {
    return this.approvals.list(user, { status, projectId });
  }

  /** Role checks (Approver vs LeadArchitect) depend on the subject and happen in the service. */
  @Post(":id/decide")
  @HttpCode(200)
  decide(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodPipe(DecideApprovalSchema)) body: DecideApprovalInput,
  ) {
    return this.approvals.decide(user, id, body);
  }
}

@Global()
@Module({ controllers: [ApprovalsController], providers: [ApprovalsService], exports: [ApprovalsService] })
export class ApprovalsModule {}
