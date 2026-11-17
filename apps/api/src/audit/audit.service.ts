import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

export interface AuditEntry {
  tenantId: string;
  actorId?: string | null;
  actorType?: "user" | "system" | "worker";
  action: string;
  entityType: string;
  entityId?: string | null;
  projectId?: string | null;
  data?: Prisma.InputJsonValue;
}

type Tx = Pick<Prisma.TransactionClient, "auditLog">;

/** Append-only audit writer. There is deliberately no update/delete API. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId ?? null,
        actorType: entry.actorType ?? "user",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        projectId: entry.projectId ?? null,
        data: entry.data ?? {},
      },
    });
  }

  list(tenantId: string, opts: { entityType?: string; entityId?: string; projectId?: string; actionPrefix?: string; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: opts.entityType,
        entityId: opts.entityId,
        projectId: opts.projectId,
        action: opts.actionPrefix ? { startsWith: opts.actionPrefix } : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.take ?? 100, 500),
    });
  }
}
