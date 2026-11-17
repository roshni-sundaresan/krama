import { Body, Controller, Delete, Get, Global, HttpCode, Module, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CreateProjectSchema, type CreateProjectInput } from "@krama/shared";
import { CurrentUser, RequirePermission, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProjectsService } from "./projects.service.js";

const UpdateIntakeSchema = CreateProjectSchema.partial();
const MemberSchema = z.object({ userId: z.string().min(1) });

@ApiTags("projects")
@ApiBearerAuth()
@Controller()
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("projects")
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user);
  }

  @Get("inbox")
  inbox(@CurrentUser() user: AuthUser) {
    return this.projects.inbox(user);
  }

  @Post("projects")
  @RequirePermission("project.create")
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateProjectSchema)) body: CreateProjectInput) {
    return this.projects.create(user, body);
  }

  @Get("projects/:projectId")
  get(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.projects.get(user, projectId);
  }

  @Patch("projects/:projectId/intake")
  @RequirePermission("intake.edit")
  updateIntake(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body(new ZodPipe(UpdateIntakeSchema)) body: Partial<CreateProjectInput>) {
    return this.projects.updateIntake(user, projectId, body);
  }

  @Get("projects/:projectId/activity")
  activity(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.projects.activity(user, projectId);
  }

  /** People a Tech Architect can assign (active users with a delivery role). */
  @Get("people")
  @RequirePermission("project.assign")
  people(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findMany({ where: { tenantId: user.tenantId, active: true }, select: { id: true, name: true, email: true, roles: true }, orderBy: { name: "asc" } });
  }

  @Post("projects/:projectId/members")
  @RequirePermission("project.assign")
  addMember(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body(new ZodPipe(MemberSchema)) body: z.infer<typeof MemberSchema>) {
    return this.projects.addMember(user, projectId, body.userId);
  }

  @Delete("projects/:projectId/members/:userId")
  @HttpCode(204)
  @RequirePermission("project.assign")
  removeMember(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Param("userId") userId: string) {
    return this.projects.removeMember(user, projectId, userId);
  }
}

@Global()
@Module({ controllers: [ProjectsController], providers: [ProjectsService], exports: [ProjectsService] })
export class ProjectsModule {}
