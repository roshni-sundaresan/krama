import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { GuardrailException as DbException, GuardrailRule as DbRule, GuardrailRuleSet } from "@prisma/client";
import {
  GuardrailRuleSchema,
  type GuardrailExceptionsFile,
  type GuardrailRule,
  type GuardrailRuleSetFile,
} from "@krama/shared";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { toDepthMode } from "../common/mappers.js";
import type { AuthUser } from "../common/auth-user.js";

/** Platform-mandated rules: must stay present, BLOCK and non-waivable in every version. */
export const MANDATORY_RULE_IDS = ["no-hardcoded-secrets", "no-unapproved-ai-providers", "no-audit-disable"] as const;

export const UpdateRuleSetSchema = z.object({
  changeNote: z.string().max(500).optional(),
  rules: z.array(GuardrailRuleSchema).min(1),
});
export type UpdateRuleSetInput = z.infer<typeof UpdateRuleSetSchema>;

export function validateRules(rules: GuardrailRule[]): void {
  const ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) throw new BadRequestException(`Duplicate rule id ${r.id}`);
    ids.add(r.id);
    if (r.type === "prohibited-pattern") {
      const patterns = r.params["patterns"];
      if (!Array.isArray(patterns) || patterns.length === 0) throw new BadRequestException(`${r.id}: params.patterns required`);
      for (const p of patterns) {
        try {
          new RegExp(String(p));
        } catch {
          throw new BadRequestException(`${r.id}: invalid regex ${String(p)}`);
        }
      }
    }
  }
  for (const id of MANDATORY_RULE_IDS) {
    const r = rules.find((x) => x.id === id);
    if (!r || !r.nonWaivable || r.level !== "BLOCK") {
      throw new BadRequestException(`Rule ${id} is platform-mandated: it must remain BLOCK and non-waivable`);
    }
  }
}

export function toRuleSetFile(set: GuardrailRuleSet & { rules: DbRule[] }): GuardrailRuleSetFile {
  return {
    ruleSetId: set.id,
    name: set.name,
    version: set.version,
    rules: set.rules.map((r) => ({
      id: r.key,
      name: r.name,
      type: r.type as GuardrailRule["type"],
      level: r.level,
      nonWaivable: r.nonWaivable,
      appliesTo: r.appliesTo,
      description: r.description ?? undefined,
      params: (r.params ?? {}) as Record<string, unknown>,
    })),
  };
}

export function toExceptionsFile(rows: DbException[]): GuardrailExceptionsFile {
  return {
    exceptions: rows.map((e) => ({
      id: e.id,
      ruleId: e.ruleKey,
      reason: e.reason,
      scope: e.scope === "CHANGE" ? "change" : "project",
      status: e.status,
      expiresAt: e.expiresAt.toISOString(),
      changeRef: e.changeRef ?? undefined,
      paths: e.paths,
      approvedBy: e.decidedById ?? undefined,
    })),
  };
}

@Injectable()
export class GuardrailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsService,
  ) {}

  async getActive(tenantId: string) {
    const set = await this.prisma.guardrailRuleSet.findFirst({
      where: { tenantId, isActive: true },
      include: { rules: { orderBy: { key: "asc" } } },
      orderBy: { version: "desc" },
    });
    if (!set) throw new NotFoundException("No active guardrail set — run the seed script");
    return set;
  }

  async activeFile(tenantId: string): Promise<GuardrailRuleSetFile> {
    return toRuleSetFile(await this.getActive(tenantId));
  }

  versions(tenantId: string) {
    return this.prisma.guardrailRuleSet.findMany({
      where: { tenantId },
      select: { id: true, name: true, version: true, isActive: true, changeNote: true, createdById: true, createdAt: true },
      orderBy: { version: "desc" },
    });
  }

  /** Lead Architect edit: creates a new immutable version and activates it. */
  async publishNewVersion(user: AuthUser, input: UpdateRuleSetInput): Promise<GuardrailRuleSetFile> {
    validateRules(input.rules);
    const current = await this.getActive(user.tenantId);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.guardrailRuleSet.update({ where: { id: current.id }, data: { isActive: false } });
      const set = await tx.guardrailRuleSet.create({
        data: {
          tenantId: user.tenantId,
          name: current.name,
          version: current.version + 1,
          isActive: true,
          changeNote: input.changeNote,
          createdById: user.id,
          rules: {
            create: input.rules.map((r) => ({
              tenantId: user.tenantId,
              key: r.id,
              name: r.name,
              type: r.type,
              level: r.level,
              nonWaivable: r.nonWaivable,
              appliesTo: r.appliesTo,
              params: r.params as object,
              description: r.description,
            })),
          },
        },
        include: { rules: { orderBy: { key: "asc" } } },
      });
      await this.audit.record(
        {
          tenantId: user.tenantId,
          actorId: user.id,
          action: "guardrails.version_published",
          entityType: "guardrail_rule_set",
          entityId: set.id,
          data: { fromVersion: current.version, toVersion: set.version, changeNote: input.changeNote ?? null },
        },
        tx,
      );
      return set;
    });
    return toRuleSetFile(created);
  }

  /** What the server-side checker enforces for a project (used by CI and the context pack). */
  async effectiveForProject(tenantId: string, projectId: string) {
    const project = await this.projects.getOrThrow(tenantId, projectId);
    const [guardrails, exceptions] = await Promise.all([
      this.activeFile(tenantId),
      this.prisma.guardrailException.findMany({
        where: { tenantId, projectId, status: "APPROVED", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { mode: toDepthMode(project.depthMode), guardrails, exceptions: toExceptionsFile(exceptions) };
  }
}
