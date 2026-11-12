import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { z } from "zod";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { CurrentUser, Roles, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { StorageService } from "../storage/storage.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { HttpIdhiAdapter, IDHI_ADAPTER, MockIdhiAdapter, type IdhiAdapter } from "../integrations/idhi.adapter.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".vtt", ".srt"]);

/**
 * Extract plain text for the Documentation capability.
 * TODO: PDF / DOCX / PPTX extraction (e.g. a Python activity using unstructured or Textract).
 */
export function extractText(buf: Buffer, mimeType: string, filename: string): string | null {
  if (mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(extname(filename).toLowerCase())) {
    return buf.toString("utf8").slice(0, 200_000);
  }
  return null;
}

const IdhiImportSchema = z.object({ meetingId: z.string().min(1) });

@Injectable()
export class SourceItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly projects: ProjectsService,
    @Inject(IDHI_ADAPTER) private readonly idhi: IdhiAdapter,
  ) {}

  async list(user: AuthUser, projectId: string) {
    await this.projects.getOrThrow(user.tenantId, projectId);
    return this.prisma.sourceItem.findMany({
      where: { tenantId: user.tenantId, projectId },
      orderBy: { createdAt: "asc" },
      select: { id: true, projectId: true, kind: true, title: true, mimeType: true, externalRef: true, sizeBytes: true, createdAt: true, text: true },
    });
  }

  async upload(user: AuthUser, projectId: string, file: Express.Multer.File) {
    await this.projects.getOrThrow(user.tenantId, projectId);
    const key = `${user.tenantId}/${projectId}/${randomUUID()}${extname(file.originalname)}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    const item = await this.prisma.sourceItem.create({
      data: {
        tenantId: user.tenantId,
        projectId,
        kind: "UPLOAD",
        title: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: key,
        text: extractText(file.buffer, file.mimetype, file.originalname),
        createdById: user.id,
      },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "source.uploaded", entityType: "source_item", entityId: item.id, data: { title: item.title, sizeBytes: file.size } });
    return item;
  }

  listIdhiMeetings(user: AuthUser, query?: string) {
    return this.idhi.listMeetings({ tenantId: user.tenantId, query });
  }

  async importIdhi(user: AuthUser, projectId: string, meetingId: string) {
    await this.projects.getOrThrow(user.tenantId, projectId);
    const meeting = await this.idhi.getMeeting({ tenantId: user.tenantId, meetingId }).catch((e: Error) => {
      throw new BadRequestException(e.message);
    });
    const item = await this.prisma.sourceItem.create({
      data: {
        tenantId: user.tenantId,
        projectId,
        kind: "IDHI_MEETING",
        title: `${meeting.title} (${meeting.date.slice(0, 10)})`,
        mimeType: "text/plain",
        externalRef: meeting.id,
        text: meeting.transcript,
        metadata: { participants: meeting.participants, date: meeting.date },
        createdById: user.id,
      },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "source.idhi_imported", entityType: "source_item", entityId: item.id, data: { meetingId } });
    return item;
  }
}

@ApiTags("sources")
@ApiBearerAuth()
@Controller()
export class SourceItemsController {
  constructor(private readonly sources: SourceItemsService) {}

  @Get("projects/:projectId/sources")
  list(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.sources.list(user, projectId);
  }

  @Post("projects/:projectId/sources/upload")
  @Roles("BA")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("file is required (multipart field 'file')");
    return this.sources.upload(user, projectId, file);
  }

  @Get("integrations/idhi/meetings")
  @Roles("BA")
  meetings(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.sources.listIdhiMeetings(user, q);
  }

  @Post("projects/:projectId/sources/idhi-import")
  @Roles("BA")
  importIdhi(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body(new ZodPipe(IdhiImportSchema)) body: z.infer<typeof IdhiImportSchema>,
  ) {
    return this.sources.importIdhi(user, projectId, body.meetingId);
  }
}

@Module({
  controllers: [SourceItemsController],
  providers: [
    SourceItemsService,
    {
      provide: IDHI_ADAPTER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): IdhiAdapter =>
        config.IDHI_MODE === "http" && config.IDHI_BASE_URL
          ? new HttpIdhiAdapter(config.IDHI_BASE_URL, config.IDHI_API_KEY)
          : new MockIdhiAdapter(),
    },
  ],
})
export class SourceItemsModule {}
