import { Controller, Get, Global, Module } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { APP_CONFIG, loadConfig } from "./config.js";
import { Public } from "./common/auth-user.js";
import { PrismaModule, PrismaService } from "./prisma/prisma.service.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { StorageModule } from "./storage/storage.service.js";
import { TemporalModule } from "./temporal/temporal.service.js";
import { AccessModule } from "./access/access.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { SourcesModule } from "./sources/sources.module.js";
import { BrdModule } from "./brd/brd.module.js";
import { PacksModule } from "./packs/packs.module.js";
import { DevModule } from "./dev/dev.module.js";

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
  imports: [ConfigModule, PrismaModule, AuditModule, AuthModule, StorageModule, TemporalModule, AccessModule, ProjectsModule, SourcesModule, BrdModule, PacksModule, DevModule],
  controllers: [HealthController],
})
export class AppModule {}
