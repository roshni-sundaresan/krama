import { Body, Controller, Get, Global, Module, Param, Post, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { DomainSchema, EntityTypeSchema, SelectStackSchema, VERTICALS, type SelectStackInput } from "@krama/shared";
import { CurrentUser, RequirePermission, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { PacksService } from "./packs.service.js";

const DecideSchema = z.object({ decision: z.enum(["APPROVE", "REJECT", "WITHDRAW"]), note: z.string().max(2000).optional() });
const DownloadQuery = z.object({
  kind: z.enum(["guardrails", "blueprints", "rules", "checklist", "ci"]).default("guardrails"),
  vertical: z.enum(VERTICALS).optional(),
  topic: z.string().max(40).optional(),
  format: z.enum(["docx", "pdf", "md"]).default("docx"),
});
const LibraryQuery = z.object({ domain: DomainSchema.optional(), entityType: EntityTypeSchema.optional(), vertical: z.enum(VERTICALS).optional() });
const LibraryDownloadQuery = z.object({
  kind: z.enum(["guardrails", "blueprints"]).default("guardrails"),
  vertical: z.enum(VERTICALS),
  domain: DomainSchema.optional(),
  topic: z.string().max(40).optional(),
  format: z.enum(["docx", "pdf", "md"]).default("docx"),
});
const PreviewQuery = z.object({ stackKey: z.string(), domain: DomainSchema, entityType: EntityTypeSchema.optional() });

function send(res: Response, f: { name: string; type: string; body: Buffer }) {
  res.setHeader("content-type", f.type);
  res.setHeader("content-disposition", `attachment; filename="${f.name}"`);
  res.send(f.body);
}

@ApiTags("stack and packs")
@ApiBearerAuth()
@Controller()
export class PacksController {
  constructor(private readonly packs: PacksService) {}

  @Get("stacks")
  stacks() {
    return this.packs.stacks();
  }

  @Get("projects/:projectId/packs")
  list(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.packs.list(user, projectId);
  }

  @Get("projects/:projectId/packs/preview")
  preview(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Query(new ZodPipe(PreviewQuery)) q: z.infer<typeof PreviewQuery>) {
    return this.packs.preview(user, projectId, q.stackKey, q.domain, q.entityType ?? null);
  }

  @Post("projects/:projectId/stack")
  @RequirePermission("stack.select")
  select(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body(new ZodPipe(SelectStackSchema)) body: SelectStackInput) {
    return this.packs.selectStack(user, projectId, body);
  }

  @Post("projects/:projectId/packs/regenerate")
  @RequirePermission("pack.generate")
  regenerate(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.packs.regenerate(user, projectId);
  }

  @Post("packs/:packId/decision")
  @RequirePermission("pack.approve")
  decide(@CurrentUser() user: AuthUser, @Param("packId") packId: string, @Body(new ZodPipe(DecideSchema)) body: z.infer<typeof DecideSchema>) {
    return this.packs.decide(user, packId, body);
  }

  @Get("projects/:projectId/packs/:packId/download")
  async download(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Param("packId") packId: string, @Query(new ZodPipe(DownloadQuery)) q: z.infer<typeof DownloadQuery>, @Res() res: Response) {
    send(res, await this.packs.download(user, projectId, packId, q));
  }

  @Get("library")
  library(@CurrentUser() user: AuthUser, @Query(new ZodPipe(LibraryQuery)) q: z.infer<typeof LibraryQuery>) {
    return this.packs.library(user, q);
  }

  @Get("library/download")
  async libraryDownload(@CurrentUser() user: AuthUser, @Query(new ZodPipe(LibraryDownloadQuery)) q: z.infer<typeof LibraryDownloadQuery>, @Res() res: Response) {
    send(res, await this.packs.libraryDownload(user, q));
  }
}

@Global()
@Module({ controllers: [PacksController], providers: [PacksService], exports: [PacksService] })
export class PacksModule {}
