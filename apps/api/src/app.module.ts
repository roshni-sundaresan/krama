import { Controller, Get, Global, Module } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { APP_CONFIG, loadConfig } from "./config.js";
import { Public } from "./common/auth-user.js";
import { PrismaModule, PrismaService } from "./prisma/prisma.service.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { StorageModule } from "./storage/storage.service.js";
import { TemporalModule } from "./temporal/temporal.service.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { SourceItemsModule } from "./source-items/source-items.module.js";
import { RequirementsModule } from "./requirements/requirements.module.js";
import { GapsModule } from "./gaps/gaps.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";
import { GuardrailsModule } from "./guardrails/guardrails.module.js";
import { ExceptionsModule } from "./exceptions/exceptions.module.js";
import { RunsModule } from "./runs/runs.module.js";
import { CapabilitiesModule } from "./capabilities/capabilities.module.js";
import { ContextPackModule } from "./context-pack/context-pack.module.js";

@Global()
@Module({ providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }], exports: [APP_CONFIG] })
class ConfigModule {}

@ApiTags("health")
@Controller("health")
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    let db = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "down";
    }
    return { status: "ok", db };
  }
}

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    StorageModule,
    TemporalModule,
    ProjectsModule,
    SourceItemsModule,
    RequirementsModule,
    GapsModule,
    DocumentsModule,
    ApprovalsModule,
    GuardrailsModule,
    ExceptionsModule,
    RunsModule,
    CapabilitiesModule,
    ContextPackModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
