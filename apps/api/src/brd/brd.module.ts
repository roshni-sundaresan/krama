import { BadRequestException, Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { AcceptanceCriterionSchema, SignoffSchema, type SignoffInput } from "@krama/shared";
import type { RunEvent } from "@krama/workflows";
import { CurrentUser, Public, RequirePermission, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { InternalTokenGuard } from "../auth/guards.js";
import { SourcesModule } from "../sources/sources.module.js";
import { BrdService } from "./brd.service.js";

const RequirementUpdateSchema = z.object({
  description: z.string().min(5).max(2000).optional(),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).optional(),
  confirmed: z.boolean().optional(),
});
const StatementSchema = z.object({
  section: z.number().int().min(0),
  statement: z.number().int().min(0).optional(),
  action: z.enum(["confirm", "remove", "edit", "confirmSection"]),
  text: z.string().max(4000).optional(),
});
const FindingSchema = z.object({ action: z.enum(["answer", "acceptDefault", "reopen"]), answer: z.string().max(2000).optional() });
const DecideSchema = z.object({ decision: z.enum(["APPROVE", "CHANGES"]), note: z.string().max(4000).optional() });
const WithdrawSchema = z.object({ note: z.string().min(5).max(1000) });

@ApiTags("brd")
@ApiBearerAuth()
@Controller()
export class BrdController {
  constructor(private readonly brd: BrdService) {}

  @Get("projects/:projectId/brd")
  workspace(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.brd.workspace(user, projectId);
  }

  @Post("projects/:projectId/brd/draft")
  @RequirePermission("brd.draft")
  draft(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.brd.startDraft(user, projectId);
  }

  @Patch("requirements/:id")
  @RequirePermission("brd.draft")
  updateRequirement(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(RequirementUpdateSchema)) body: z.infer<typeof RequirementUpdateSchema>) {
    return this.brd.updateRequirement(user, id, body);
  }

  @Post("documents/:id/requirements/confirm-all")
  @RequirePermission("brd.draft")
  confirmAll(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.brd.confirmAllRequirements(user, id);
  }

  @Post("documents/:id/statements")
  @RequirePermission("brd.draft")
  statement(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(StatementSchema)) body: z.infer<typeof StatementSchema>) {
    return this.brd.editStatement(user, id, body);
  }

  @Post("findings/:id")
  @RequirePermission("brd.draft")
  finding(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(FindingSchema)) body: z.infer<typeof FindingSchema>) {
    return this.brd.resolveFinding(user, id, body);
  }

  /** Lenses-only preview: runs the Deep Audit without submitting. */
  @Post("documents/:id/audit")
  @RequirePermission("brd.draft")
  audit(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.brd.runAudit(user, id);
  }

  @Post("documents/:id/submit")
  @HttpCode(200)
  @RequirePermission("brd.submit")
  submit(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.brd.submit(user, id);
  }

  @Post("documents/:id/decision")
  @RequirePermission("brd.approve")
  decide(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(DecideSchema)) body: z.infer<typeof DecideSchema>) {
    return this.brd.decide(user, id, body);
  }

  @Post("documents/:id/signoff")
  @RequirePermission("signoff.record")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("evidence", { limits: { fileSize: 25 * 1024 * 1024 } }))
  signoff(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() raw: Record<string, string>, @UploadedFile() evidence?: Express.Multer.File) {
    const parsed = SignoffSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException({ message: "Validation failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    return this.brd.recordSignoff(user, id, parsed.data as SignoffInput, evidence);
  }

  @Post("documents/:id/signoff/withdraw")
  @RequirePermission("brd.approve")
  withdraw(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(WithdrawSchema)) body: z.infer<typeof WithdrawSchema>) {
    return this.brd.withdrawSignoff(user, id, body.note);
  }

  @Get("documents/:id/export")
  async export(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("format") format: string | undefined, @Res() res: Response) {
    const f = await this.brd.export(user, id, format === "md" ? "md" : format === "pdf" ? "pdf" : "docx");
    res.setHeader("content-type", f.type);
    res.setHeader("content-disposition", `attachment; filename="${f.name}"`);
    res.send(f.body);
  }
}

/** Worker → API callbacks (shared secret, not user JWT). */
@ApiTags("internal")
@Controller("internal")
export class InternalRunsController {
  constructor(private readonly brd: BrdService) {}

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post("runs/:runId/events")
  @HttpCode(204)
  async event(@Param("runId") runId: string, @Body() body: RunEvent) {
    await this.brd.recordRunEvent(runId, body);
  }
}

@Module({ imports: [SourcesModule], controllers: [BrdController, InternalRunsController], providers: [BrdService] })
export class BrdModule {}
