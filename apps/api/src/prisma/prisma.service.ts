import { Global, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client. Tenant isolation is enforced in services: every query
 * filters by the caller's tenantId (TODO: add Postgres row-level security as defence in depth).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
