import { Body, Controller, Get, Global, HttpCode, Module, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { regulationsFor, VERTICAL_LABELS, VERTICALS, type Vertical } from "@krama/shared";
import { CurrentUser, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { footerText, renderFile } from "../common/render.js";
import { guardrailDoc } from "../common/guardrail-doc.js";
import { AuditService } from "../audit/audit.service.js";
import { GuardrailsService, PublishSchema, UpdateDraftSchema, type StoredRule, type UpdateDraftInput } from "./guardrails.service.js";

const VerticalParam = z.enum(VERTICALS);
const DownloadQuery = z.object({ format: z.enum(["docx", "pdf"]).default("docx") });

function send(res: Response, f: { name: string; type: string; body: Buffer }) {
  res.setHeader("content-type", f.type);
  res.setHeader("content-disposition", `attachment; filename="${f.name.replace(/"/g, "")}"`);
  res.send(f.body);
}

/** Guardrail management: leads edit, add, retire or upload their vertical's master guardrails as versions. */
@ApiTags("guardrail management")
@ApiBearerAuth()
@Controller("guardrails")
export class GuardrailsController {
  constructor(
    private readonly guardrails: GuardrailsService,
    private readonly audit: AuditService,
  ) {}

  @Get("versions")
  overview(@CurrentUser() user: AuthUser) {
    return this.guardrails.overview(user);
  }

  @Get("versions/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.guardrails.get(user, id);
  }

  @Post(":vertical/drafts")
  create(@CurrentUser() user: AuthUser, @Param("vertical", new ZodPipe(VerticalParam)) vertical: Vertical) {
    return this.guardrails.createDraft(user, vertical);
  }

  @Patch("versions/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(UpdateDraftSchema)) body: UpdateDraftInput) {
    return this.guardrails.updateDraft(user, id, body);
  }

  @Post("versions/:id/document")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 21 * 1024 * 1024 } }))
  upload(@CurrentUser() user: AuthUser, @Param("id") id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.guardrails.uploadDocument(user, id, file);
  }

  @Get("versions/:id/document")
  async document(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    send(res, await this.guardrails.document(user, id));
  }

  @Post("versions/:id/publish")
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(PublishSchema)) body: z.infer<typeof PublishSchema>) {
    return this.guardrails.publish(user, id, body.changeNote);
  }

  @Post("versions/:id/discard")
  @HttpCode(200)
  discard(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.guardrails.discard(user, id);
  }

  /** Any version's active rules as Word or PDF (drafts are marked as drafts). */
  @Get("versions/:id/download")
  async download(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query(new ZodPipe(DownloadQuery)) q: z.infer<typeof DownloadQuery>, @Res() res: Response) {
    const v = await this.guardrails.get(user, id);
    const rules = (v.rules as StoredRule[]).filter((r) => !r.retired);
    const label = VERTICAL_LABELS[v.vertical];
    const versionText = `v${v.version}${v.status === "DRAFT" ? " (draft)" : ""}`;
    const meta: [string, string][] = [["Vertical", label], ["Version", versionText], ["Status", v.status.toLowerCase()], ["Change note", v.changeNote || "—"]];
    const doc = guardrailDoc(`${label} guardrails ${versionText}`, meta, rules, regulationsFor(rules), footerText({ project: "Master guardrails", version: versionText, user: user.email }));
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "guardrails.version_downloaded", entityType: "guardrail_version", entityId: id, data: { format: q.format } });
    send(res, await renderFile(doc, `Krama_${v.vertical.toLowerCase()}_guardrails_v${v.version}`, q.format));
  }
}

@Global()
@Module({ controllers: [GuardrailsController], providers: [GuardrailsService], exports: [GuardrailsService] })
export class GuardrailsModule {}
