import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Prisma } from "@prisma/client";
import AdmZip from "adm-zip";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { can, RequestExceptionSchema, type GuardrailException, type RequestExceptionInput } from "@krama/shared";
import { runCheck } from "@krama/guardrails";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { CurrentUser, RequirePermission, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { fail } from "../common/errors.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { PacksService, toRuleSetFile, type PackContent } from "../packs/packs.service.js";

const run = promisify(execFile);
const ChecklistSchema = z.object({ ticked: z.array(z.string()) });
const RepoSchema = z.object({ repoUrl: z.url().refine((u) => u.startsWith("https://"), "Use an https:// repository link") });
const DecideSchema = z.object({ decision: z.enum(["APPROVE", "REJECT", "REVOKE"]), note: z.string().max(1000).optional() });

/** Extract a zip safely (no paths outside the target, no symlinks). */
export async function safeExtract(zipBuf: Buffer, dest: string, maxFiles = 20_000): Promise<number> {
  const zip = new AdmZip(zipBuf);
  const entries = zip.getEntries();
  if (entries.length > maxFiles) throw new BadRequestException("The ZIP has too many files");
  const root = resolve(dest) + sep;
  let n = 0;
  for (const e of entries) {
    if (e.isDirectory) continue;
    const target = resolve(dest, e.entryName);
    if (!target.startsWith(root)) throw new BadRequestException("The ZIP contains unsafe paths");
    const attr = (e.header as unknown as { attr: number }).attr;
    if (((attr >>> 16) & 0o170000) === 0o120000) continue; // skip symlinks
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, e.getData());
    n++;
  }
  return n;
}

@Injectable()
export class DevService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsService,
    private readonly packs: PacksService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async view(user: AuthUser, projectId: string) {
    const project = await this.projects.get(user, projectId);
    const pack = await this.packs.approvedPack(projectId);
    const content = pack ? (pack.content as unknown as PackContent) : null;
    const [mine, all, checks, exceptions] = await Promise.all([
      pack ? this.prisma.checklistConfirmation.findFirst({ where: { projectId, userId: user.id, packVersion: pack.version } }) : null,
      pack ? this.prisma.checklistConfirmation.findMany({ where: { projectId, packVersion: pack.version } }) : [],
      this.prisma.projectCheck.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.guardrailException.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    ]);
    const developers = project.members.filter((m) => (m.user.roles as string[]).includes("Developer"));
    const team = developers.map((m) => ({ ...m.user, ready: all.some((c) => c.userId === m.user.id), confirmedAt: all.find((c) => c.userId === m.user.id)?.confirmedAt ?? null }));
    const names = new Map(project.members.map((m) => [m.user.id, m.user.name]));
    return {
      project,
      pack: pack ? { id: pack.id, version: pack.version, approvedAt: pack.approvedAt, stack: content!.stack, ruleCount: content!.rules.length, checkable: content!.rules.filter((r) => r.check).map((r) => r.id), rules: content!.rules.map((r) => ({ id: r.id, title: r.title, level: r.level, vertical: r.vertical })) } : null,
      checklist: content?.checklist ?? [],
      myConfirmation: mine,
      team,
      checks: checks.map((c) => ({ ...c, userName: names.get(c.userId) ?? "" })),
      exceptions: exceptions.map((e) => ({ ...e, requestedByName: names.get(e.requestedById) ?? "" })),
    };
  }

  async confirmChecklist(user: AuthUser, projectId: string, ticked: string[]) {
    await this.projects.getOrThrow(user, projectId);
    const pack = await this.packs.approvedPack(projectId);
    if (!pack) fail("MSG-STK-02", HttpStatus.CONFLICT);
    const items = (pack.content as unknown as PackContent).checklist;
    const missing = items.filter((i) => i.required && !ticked.includes(i.id));
    if (missing.length) fail("MSG-DEV-01", HttpStatus.BAD_REQUEST);
    const row = await this.prisma.checklistConfirmation.upsert({
      where: { projectId_userId_packVersion: { projectId, userId: user.id, packVersion: pack.version } },
      create: { tenantId: user.tenantId, projectId, userId: user.id, packVersion: pack.version, items: items.map((i) => ({ id: i.id, name: i.name, version: i.version, ticked: ticked.includes(i.id) })) as Prisma.InputJsonValue },
      update: { confirmedAt: new Date() },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "dev.checklist_confirmed", entityType: "project", entityId: projectId, projectId, data: { packVersion: pack.version } });
    return row;
  }

  /** Optional project check (BRD-DEV-FR-16): uploaded code is checked in a temp folder and deleted afterwards. */
  async check(user: AuthUser, projectId: string, source: { zip?: Buffer; zipName?: string; repoUrl?: string }) {
    await this.projects.getOrThrow(user, projectId);
    const pack = await this.packs.approvedPack(projectId);
    if (!pack) fail("MSG-STK-02", HttpStatus.CONFLICT);
    const content = pack.content as unknown as PackContent;
    const ruleSet = toRuleSetFile(`project-pack`, pack.version, content.rules);
    const ex = await this.prisma.guardrailException.findMany({ where: { projectId, status: "APPROVED" } });
    const exceptions: GuardrailException[] = ex.map((e) => ({ id: e.id, ruleId: e.ruleId, reason: e.reason, scope: "project", status: "APPROVED", expiresAt: e.expiresAt.toISOString(), paths: [] }));
    const row = await this.prisma.projectCheck.create({
      data: { tenantId: user.tenantId, projectId, userId: user.id, source: source.repoUrl ? "REPO" : "UPLOAD", ref: source.repoUrl ?? source.zipName ?? "upload.zip", packVersion: pack.version },
    });
    const dir = await mkdtemp(join(tmpdir(), "krama-check-"));
    try {
      if (source.repoUrl) {
        const url = this.config.GITHUB_TOKEN && source.repoUrl.startsWith("https://github.com/")
          ? source.repoUrl.replace("https://", `https://x-access-token:${this.config.GITHUB_TOKEN}@`)
          : source.repoUrl;
        try {
          await run("git", ["clone", "--depth", "1", "--quiet", url, join(dir, "repo")], { timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
        } catch {
          await this.prisma.projectCheck.update({ where: { id: row.id }, data: { status: "FAILED", error: "MSG-DEV-02" } });
          fail("MSG-DEV-02", HttpStatus.BAD_REQUEST);
        }
      } else {
        await safeExtract(source.zip!, join(dir, "repo"));
      }
      const report = runCheck({ root: join(dir, "repo"), ruleSet, exceptions, mode: "guided" });
      const updated = await this.prisma.projectCheck.update({
        where: { id: row.id },
        data: { status: "COMPLETED", passed: report.passed, blocking: report.blockingFailures, warnings: report.warnings, filesScanned: report.filesScanned, report: report as unknown as Prisma.InputJsonValue },
      });
      await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "dev.project_check", entityType: "project_check", entityId: row.id, projectId, data: { passed: report.passed, blocking: report.blockingFailures, warnings: report.warnings, source: row.source } });
      return updated;
    } finally {
      await rm(dir, { recursive: true, force: true }); // uploaded code is not kept (FSD section 23)
    }
  }

  async requestException(user: AuthUser, input: RequestExceptionInput) {
    await this.projects.getOrThrow(user, input.projectId);
    const pack = await this.packs.approvedPack(input.projectId);
    const rule = (pack?.content as unknown as PackContent | undefined)?.rules.find((r) => r.id === input.ruleId);
    if (!rule) throw new NotFoundException("That rule is not in the approved pack");
    if (rule.level === "NON_WAIVABLE") throw new ConflictException("Non-waivable rules cannot have exceptions");
    if (Date.parse(input.expiresAt) <= Date.now()) throw new BadRequestException("Expiry must be in the future");
    const e = await this.prisma.guardrailException.create({
      data: { tenantId: user.tenantId, projectId: input.projectId, ruleId: input.ruleId, reason: input.reason, compensatingControl: input.compensatingControl, expiresAt: new Date(input.expiresAt), requestedById: user.id },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "exception.requested", entityType: "exception", entityId: e.id, projectId: input.projectId, data: { ruleId: input.ruleId } });
    return e;
  }

  async decideException(user: AuthUser, id: string, input: z.infer<typeof DecideSchema>) {
    const e = await this.prisma.guardrailException.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!e) throw new NotFoundException("Exception not found");
    await this.projects.getOrThrow(user, e.projectId);
    // BA rules are decided by the BA Lead; all others by a Tech Architect.
    const isBaRule = /^(BA|BRD|IN|FSD|API)-G/.test(e.ruleId);
    if (!(isBaRule ? can(user.roles, "brd.approve") : user.roles.includes("TechArchitect"))) fail("MSG-AUTH-03", HttpStatus.FORBIDDEN);
    if (input.decision === "REVOKE" ? e.status !== "APPROVED" : e.status !== "REQUESTED") throw new ConflictException("This exception cannot change that way");
    const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "REVOKED";
    const u = await this.prisma.guardrailException.update({ where: { id }, data: { status, decidedById: user.id, decidedAt: new Date(), decisionNote: input.note } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: `exception.${status.toLowerCase()}`, entityType: "exception", entityId: id, projectId: e.projectId, data: { ruleId: e.ruleId } });
    return u;
  }
}

@ApiTags("development")
@ApiBearerAuth()
@Controller()
export class DevController {
  constructor(
    private readonly dev: DevService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get("projects/:projectId/development")
  view(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.dev.view(user, projectId);
  }

  @Post("projects/:projectId/checklist")
  @RequirePermission("checklist.confirm")
  confirm(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body(new ZodPipe(ChecklistSchema)) body: z.infer<typeof ChecklistSchema>) {
    return this.dev.confirmChecklist(user, projectId, body.ticked);
  }

  @Post("projects/:projectId/checks/upload")
  @RequirePermission("check.run")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 210 * 1024 * 1024 } }))
  upload(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("file is required (multipart field 'file')");
    if (!file.originalname.toLowerCase().endsWith(".zip")) fail("MSG-UPL-01", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    if (file.size > this.config.MAX_PROJECT_ZIP_MB * 1024 * 1024) fail("MSG-UPL-02", HttpStatus.PAYLOAD_TOO_LARGE, { limit: `${this.config.MAX_PROJECT_ZIP_MB} MB` });
    return this.dev.check(user, projectId, { zip: file.buffer, zipName: file.originalname });
  }

  @Post("projects/:projectId/checks/repo")
  @RequirePermission("check.run")
  repo(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body(new ZodPipe(RepoSchema)) body: z.infer<typeof RepoSchema>) {
    return this.dev.check(user, projectId, { repoUrl: body.repoUrl });
  }

  @Post("exceptions")
  @RequirePermission("exception.request")
  request(@CurrentUser() user: AuthUser, @Body(new ZodPipe(RequestExceptionSchema)) body: RequestExceptionInput) {
    return this.dev.requestException(user, body);
  }

  @Post("exceptions/:id/decision")
  @RequirePermission("exception.decide")
  decide(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(DecideSchema)) body: z.infer<typeof DecideSchema>) {
    return this.dev.decideException(user, id, body);
  }
}

@Module({ controllers: [DevController], providers: [DevService] })
export class DevModule {}
