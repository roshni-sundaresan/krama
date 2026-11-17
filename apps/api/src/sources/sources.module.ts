import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { findInjectionAttempts, maskPersonalData, TagSourceSchema, type TagSourceInput } from "@krama/shared";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { CurrentUser, RequirePermission, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { fail } from "../common/errors.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { StorageService } from "../storage/storage.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ACCEPTED_EXTENSIONS, extensionOf, extractText, scanBuffer } from "./extract.js";
import { HttpIdhiAdapter, IDHI_ADAPTER, MockIdhiAdapter, type IdhiAdapter } from "./idhi.adapter.js";

const IdhiImportSchema = z.object({ meetingId: z.string().min(1) });

export interface ReadinessRule {
  id: string;
  title: string;
  level: "NON_WAIVABLE" | "BLOCK" | "WARN";
  passed: boolean;
  note: string;
}

const SOURCE_SELECT = {
  id: true, projectId: true, kind: true, title: true, mimeType: true, sizeBytes: true, externalRef: true,
  docType: true, version: true, docDate: true, provider: true, personalData: true, piiFindings: true,
  injectionFlags: true, maskingConfirmedAt: true, createdAt: true, maskedText: true,
} as const;

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly projects: ProjectsService,
    @Inject(IDHI_ADAPTER) private readonly idhi: IdhiAdapter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async list(user: AuthUser, projectId: string) {
    await this.projects.getOrThrow(user, projectId);
    return this.prisma.sourceItem.findMany({ where: { tenantId: user.tenantId, projectId }, orderBy: { createdAt: "asc" }, select: SOURCE_SELECT });
  }

  private analyse(text: string | null) {
    if (!text) return { maskedText: null, piiFindings: [] as Prisma.InputJsonValue, injectionFlags: [] as Prisma.InputJsonValue, piiCount: 0 };
    const m = maskPersonalData(text);
    return { maskedText: m.masked, piiFindings: m.findings as unknown as Prisma.InputJsonValue, injectionFlags: findInjectionAttempts(text), piiCount: m.total };
  }

  async upload(user: AuthUser, projectId: string, file: Express.Multer.File) {
    await this.projects.getOrThrow(user, projectId);
    const ext = extensionOf(file.originalname);
    if (!ACCEPTED_EXTENSIONS.has(ext)) fail("MSG-UPL-01", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    if (file.size > this.config.MAX_UPLOAD_MB * 1024 * 1024) fail("MSG-UPL-02", HttpStatus.PAYLOAD_TOO_LARGE, { limit: `${this.config.MAX_UPLOAD_MB} MB` });
    const scan = await scanBuffer(file.buffer, { host: this.config.CLAMAV_HOST, port: this.config.CLAMAV_PORT });
    if (!scan.clean) {
      await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "source.rejected_malware", entityType: "project", entityId: projectId, projectId, data: { file: file.originalname, signature: scan.signature ?? "", engine: scan.engine } });
      fail("MSG-UPL-03", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const text: string | null = await extractText(file.buffer, file.originalname).catch(() => null);
    const key = `${user.tenantId}/${projectId}/sources/${randomUUID()}${ext}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    const { piiCount, ...analysed } = this.analyse(text);
    const item = await this.prisma.sourceItem.create({
      data: {
        tenantId: user.tenantId, projectId, kind: "UPLOAD", title: file.originalname, mimeType: file.mimetype,
        sizeBytes: file.size, storageKey: key, text, ...analysed, personalData: piiCount > 0, createdById: user.id,
      },
      select: SOURCE_SELECT,
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "source.uploaded", entityType: "source_item", entityId: item.id, projectId, data: { title: item.title, sizeBytes: file.size, scan: scan.engine, piiFound: piiCount } });
    return item;
  }

  listIdhiMeetings(user: AuthUser, query?: string) {
    return this.idhi.listMeetings({ tenantId: user.tenantId, query });
  }

  async importIdhi(user: AuthUser, projectId: string, meetingId: string) {
    await this.projects.getOrThrow(user, projectId);
    const meeting = await this.idhi.getMeeting({ tenantId: user.tenantId, meetingId }).catch((e: Error) => {
      throw new BadRequestException(e.message);
    });
    const { piiCount, ...analysed } = this.analyse(meeting.transcript);
    const item = await this.prisma.sourceItem.create({
      data: {
        tenantId: user.tenantId, projectId, kind: "IDHI_MEETING", title: meeting.title, mimeType: "text/plain", externalRef: meeting.id,
        text: meeting.transcript, ...analysed, personalData: piiCount > 0,
        docType: "MOM", version: "1", docDate: meeting.date.slice(0, 10), provider: "iDhi", createdById: user.id,
      },
      select: SOURCE_SELECT,
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "source.idhi_imported", entityType: "source_item", entityId: item.id, projectId, data: { meetingId } });
    return item;
  }

  async tag(user: AuthUser, projectId: string, sourceId: string, input: TagSourceInput) {
    await this.projects.getOrThrow(user, projectId);
    const item = await this.prisma.sourceItem.update({
      where: { id: sourceId, projectId },
      data: { ...input, maskingConfirmedAt: input.personalData ? undefined : null },
      select: SOURCE_SELECT,
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "source.tagged", entityType: "source_item", entityId: sourceId, projectId, data: input });
    return item;
  }

  /** The BA confirms the masked copy before any AI drafting uses it (IN-G01, VAL-GEN-01). */
  async confirmMasking(user: AuthUser, projectId: string, sourceId: string) {
    await this.projects.getOrThrow(user, projectId);
    const item = await this.prisma.sourceItem.update({
      where: { id: sourceId, projectId },
      data: { maskingConfirmedAt: new Date(), maskingConfirmedById: user.id },
      select: SOURCE_SELECT,
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "source.masking_confirmed", entityType: "source_item", entityId: sourceId, projectId });
    return item;
  }

  /** Download the original file; logged and only for the project team (BRD-DG-09). */
  async download(user: AuthUser, projectId: string, sourceId: string) {
    await this.projects.getOrThrow(user, projectId);
    const item = await this.prisma.sourceItem.findFirstOrThrow({ where: { id: sourceId, projectId } });
    if (!item.storageKey) throw new BadRequestException("This source has no stored file");
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "source.downloaded", entityType: "source_item", entityId: sourceId, projectId });
    return { item, body: await this.storage.get(item.storageKey) };
  }

  /** Intake readiness (IN-G01 to IN-G05). */
  async readiness(user: AuthUser, projectId: string): Promise<{ ready: boolean; rules: ReadinessRule[] }> {
    const p = await this.projects.getOrThrow(user, projectId);
    const items = await this.prisma.sourceItem.findMany({ where: { projectId } });
    const unmasked = items.filter((i) => i.personalData && !i.maskingConfirmedAt);
    const untagged = items.filter((i) => !i.docType || !i.version || !i.docDate || !i.provider);
    const rules: ReadinessRule[] = [
      { id: "IN-G01", title: "Personal data masked before AI", level: "NON_WAIVABLE", passed: unmasked.length === 0, note: unmasked.length ? `${unmasked.length} to review` : "Pass" },
      { id: "IN-G02", title: "Intake form and sign-off owner", level: "BLOCK", passed: Boolean(p.clientSignoffOwner && p.platforms.length), note: p.clientSignoffOwner ? "Pass" : "Name the sign-off owner" },
      { id: "IN-G03", title: "SOW uploaded", level: "BLOCK", passed: items.some((i) => i.docType === "SOW"), note: items.some((i) => i.docType === "SOW") ? "Pass" : "Upload and tag the SOW" },
      { id: "IN-G04", title: "MOM or client document", level: "BLOCK", passed: items.some((i) => i.docType === "MOM" || i.docType === "PROCESS" || i.docType === "POLICY"), note: "At least one" },
      { id: "IN-G05", title: "Every document tagged", level: "BLOCK", passed: untagged.length === 0 && items.length > 0, note: untagged.length ? `${untagged.length} untagged` : "Pass" },
    ];
    return { ready: rules.every((r) => r.passed), rules };
  }
}

@ApiTags("sources")
@ApiBearerAuth()
@Controller()
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get("projects/:projectId/sources")
  list(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.sources.list(user, projectId);
  }

  @Get("projects/:projectId/readiness")
  readiness(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.sources.readiness(user, projectId);
  }

  @Post("projects/:projectId/sources/upload")
  @RequirePermission("intake.edit")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 210 * 1024 * 1024 } }))
  upload(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("file is required (multipart field 'file')");
    return this.sources.upload(user, projectId, file);
  }

  @Post("projects/:projectId/sources/:sourceId/tag")
  @RequirePermission("intake.edit")
  tag(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Param("sourceId") sourceId: string, @Body(new ZodPipe(TagSourceSchema)) body: TagSourceInput) {
    return this.sources.tag(user, projectId, sourceId, body);
  }

  @Post("projects/:projectId/sources/:sourceId/confirm-masking")
  @RequirePermission("intake.edit")
  confirmMasking(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Param("sourceId") sourceId: string) {
    return this.sources.confirmMasking(user, projectId, sourceId);
  }

  @Get("projects/:projectId/sources/:sourceId/file")
  async file(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Param("sourceId") sourceId: string, @Res() res: Response) {
    const { item, body } = await this.sources.download(user, projectId, sourceId);
    res.setHeader("content-type", item.mimeType ?? "application/octet-stream");
    res.setHeader("content-disposition", `attachment; filename="${encodeURIComponent(item.title)}"`);
    res.send(body);
  }

  @Get("integrations/idhi/meetings")
  @RequirePermission("intake.edit")
  meetings(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.sources.listIdhiMeetings(user, q);
  }

  @Post("projects/:projectId/sources/idhi-import")
  @RequirePermission("intake.edit")
  importIdhi(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body(new ZodPipe(IdhiImportSchema)) body: z.infer<typeof IdhiImportSchema>) {
    return this.sources.importIdhi(user, projectId, body.meetingId);
  }
}

@Module({
  controllers: [SourcesController],
  providers: [
    SourcesService,
    {
      provide: IDHI_ADAPTER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): IdhiAdapter =>
        config.IDHI_MODE === "http" && config.IDHI_BASE_URL ? new HttpIdhiAdapter(config.IDHI_BASE_URL, config.IDHI_API_KEY) : new MockIdhiAdapter(),
    },
  ],
  exports: [SourcesService],
})
export class SourcesModule {}
