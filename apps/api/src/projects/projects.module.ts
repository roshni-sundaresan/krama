import { Body, Controller, Get, Global, Module, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CODING_TOOLS, CreateProjectSchema, DepthModeSchema, type CreateProjectInput } from "@krama/shared";
import { CurrentUser, Roles, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ProjectsService } from "./projects.service.js";

const UpdateSettingsSchema = z.object({
  depthMode: DepthModeSchema.optional(),
  approvedTools: z.array(z.enum(CODING_TOOLS)).optional(),
});
const DecisionSchema = z.object({
  title: z.string().min(3),
  context: z.string().min(1),
  decision: z.string().min(1),
  consequences: z.string().default(""),
});

@ApiTags("projects")
@ApiBearerAuth()
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user);
  }

  @Post()
  @Roles("BA", "LeadArchitect")
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateProjectSchema)) body: CreateProjectInput) {
    return this.projects.create(user, body);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.get(user, id);
  }

  /** Depth mode and approved coding tools are Lead Architect decisions. */
  @Patch(":id/settings")
  @Roles("LeadArchitect")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodPipe(UpdateSettingsSchema)) body: z.infer<typeof UpdateSettingsSchema>,
  ) {
    return this.projects.updateSettings(user, id, body);
  }

  @Get(":id/decisions")
  decisions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.listDecisions(user, id);
  }

  @Post(":id/decisions")
  @Roles("LeadArchitect")
  addDecision(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodPipe(DecisionSchema)) body: z.infer<typeof DecisionSchema>,
  ) {
    return this.projects.addDecision(user, id, body);
  }
}

@Global()
@Module({ controllers: [ProjectsController], providers: [ProjectsService], exports: [ProjectsService] })
export class ProjectsModule {}
