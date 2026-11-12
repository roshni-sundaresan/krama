import { Body, Controller, Get, HttpCode, Module, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeController, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { RunEvent } from "@krama/workflows";
import { CurrentUser, Public, Roles, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { InternalTokenGuard } from "../auth/guards.js";
import { RunsService } from "./runs.service.js";

// Loose envelope validation; payload shapes are produced by our own workers.
const RunEventSchema = z
  .object({ type: z.enum(["stage", "requirements", "gaps", "document"]) })
  .passthrough() as unknown as z.ZodType<RunEvent>;

@ApiTags("runs")
@ApiBearerAuth()
@Controller()
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get("projects/:projectId/runs")
  list(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.runs.list(user, projectId);
  }

  /** Start the Documentation capability (extract → gaps → [approval] → drafts → [approval]). */
  @Post("projects/:projectId/runs/documentation")
  @Roles("BA")
  start(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.runs.startDocumentation(user, projectId);
  }

  @Get("projects/:projectId/token-usage")
  usage(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.runs.usageSummary(user, projectId);
  }

  @Get("runs/:runId")
  get(@CurrentUser() user: AuthUser, @Param("runId") runId: string) {
    return this.runs.get(user.tenantId, runId);
  }
}

/** Worker → API callbacks. Not user-facing; protected by the internal token. */
@ApiExcludeController()
@Controller("internal")
export class InternalRunsController {
  constructor(private readonly runs: RunsService) {}

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post("runs/:runId/events")
  @HttpCode(204)
  async event(@Param("runId") runId: string, @Body(new ZodPipe(RunEventSchema)) body: RunEvent) {
    await this.runs.recordEvent(runId, body);
  }
}

@Module({ controllers: [RunsController, InternalRunsController], providers: [RunsService, InternalTokenGuard] })
export class RunsModule {}
