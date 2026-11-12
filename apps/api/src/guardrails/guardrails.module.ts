import { Body, Controller, Get, Global, Module, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, Roles, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { GuardrailsService, UpdateRuleSetSchema, type UpdateRuleSetInput } from "./guardrails.service.js";

@ApiTags("guardrails")
@ApiBearerAuth()
@Controller()
export class GuardrailsController {
  constructor(private readonly guardrails: GuardrailsService) {}

  /** Everyone can read the team guardrails (developers read-only). */
  @Get("guardrails/active")
  active(@CurrentUser() user: AuthUser) {
    return this.guardrails.activeFile(user.tenantId);
  }

  @Get("guardrails/versions")
  versions(@CurrentUser() user: AuthUser) {
    return this.guardrails.versions(user.tenantId);
  }

  /** Lead Architect publishes a new version (previous versions are kept). */
  @Put("guardrails/active")
  @Roles("LeadArchitect")
  publish(@CurrentUser() user: AuthUser, @Body(new ZodPipe(UpdateRuleSetSchema)) body: UpdateRuleSetInput) {
    return this.guardrails.publishNewVersion(user, body);
  }

  /** Rules + approved, unexpired exceptions + mode — consumed by the CI guardrail check. */
  @Get("projects/:projectId/guardrails/effective")
  effective(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.guardrails.effectiveForProject(user.tenantId, projectId);
  }
}

@Global()
@Module({ controllers: [GuardrailsController], providers: [GuardrailsService], exports: [GuardrailsService] })
export class GuardrailsModule {}
