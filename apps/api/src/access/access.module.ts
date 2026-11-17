import { Body, Controller, Get, HttpStatus, Inject, Injectable, Module, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { isAllowedEmail, RoleSchema, type Role } from "@krama/shared";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { CurrentUser, RequirePermission, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { fail } from "../common/errors.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";

const AddUserSchema = z.object({ email: z.email(), name: z.string().min(2).max(120), roles: z.array(RoleSchema).default([]) });
const UpdateUserSchema = z.object({ roles: z.array(RoleSchema).optional(), active: z.boolean().optional() });

/** Access administration (FSD section 3.1, screen SCR-14). Super Admin only. */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private emailAllowed(email: string): boolean {
    return isAllowedEmail(email, this.config.AUTH_DEV_LOGIN ? this.config.DEV_EXTRA_EMAIL_DOMAINS : []);
  }

  list(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, email: true, name: true, roles: true, active: true, lastSignInAt: true, createdAt: true },
    });
  }

  async add(actor: AuthUser, input: z.infer<typeof AddUserSchema>) {
    const email = input.email.toLowerCase();
    if (!this.emailAllowed(email)) fail("MSG-AUTH-04", HttpStatus.BAD_REQUEST);
    const user = await this.prisma.user.upsert({
      where: { tenantId_email: { tenantId: actor.tenantId, email } },
      create: { tenantId: actor.tenantId, email, name: input.name, roles: input.roles },
      update: { name: input.name, roles: input.roles, active: true },
    });
    await this.audit.record({ tenantId: actor.tenantId, actorId: actor.id, action: "access.user_added", entityType: "user", entityId: user.id, data: { email, roles: input.roles } });
    return user;
  }

  async update(actor: AuthUser, userId: string, input: z.infer<typeof UpdateUserSchema>) {
    const target = await this.prisma.user.findFirst({ where: { id: userId, tenantId: actor.tenantId } });
    if (!target) throw new NotFoundException("User not found");
    const before = target.roles as Role[];
    const nextRoles = input.roles ?? before;
    const nextActive = input.active ?? target.active;
    const losesSuperAdmin = before.includes("SuperAdmin") && (!nextRoles.includes("SuperAdmin") || !nextActive);
    if (losesSuperAdmin) {
      const others = await this.prisma.user.count({
        where: { tenantId: actor.tenantId, active: true, roles: { has: "SuperAdmin" }, id: { not: userId } },
      });
      if (others === 0) fail("MSG-AUTH-05", HttpStatus.CONFLICT);
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data: { roles: nextRoles, active: nextActive } });
    const added = nextRoles.filter((r) => !before.includes(r));
    const removed = before.filter((r) => !nextRoles.includes(r));
    for (const role of added)
      await this.audit.record({
        tenantId: actor.tenantId, actorId: actor.id, entityType: "user", entityId: userId,
        action: role === "TechArchitect" ? "access.tech_architect_granted" : "access.role_granted",
        data: { email: target.email, role },
      });
    for (const role of removed)
      await this.audit.record({ tenantId: actor.tenantId, actorId: actor.id, action: "access.role_revoked", entityType: "user", entityId: userId, data: { email: target.email, role } });
    if (input.active !== undefined && input.active !== target.active)
      await this.audit.record({ tenantId: actor.tenantId, actorId: actor.id, action: input.active ? "access.user_enabled" : "access.user_disabled", entityType: "user", entityId: userId, data: { email: target.email } });
    return user;
  }

  async log(tenantId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { tenantId, OR: [{ action: { startsWith: "access." } }, { action: { startsWith: "auth." } }] },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const actors = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const names = new Map(actors.map((a) => [a.id, a.name]));
    return rows.map((r) => ({ ...r, actorName: r.actorId ? (names.get(r.actorId) ?? r.actorId) : "System" }));
  }
}

@ApiTags("access")
@ApiBearerAuth()
@Controller("access")
@RequirePermission("users.manage")
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get("users")
  list(@CurrentUser() user: AuthUser) {
    return this.access.list(user.tenantId);
  }

  @Post("users")
  add(@CurrentUser() user: AuthUser, @Body(new ZodPipe(AddUserSchema)) body: z.infer<typeof AddUserSchema>) {
    return this.access.add(user, body);
  }

  @Patch("users/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(UpdateUserSchema)) body: z.infer<typeof UpdateUserSchema>) {
    return this.access.update(user, id, body);
  }

  @Get("log")
  log(@CurrentUser() user: AuthUser) {
    return this.access.log(user.tenantId);
  }
}

@Module({ controllers: [AccessController], providers: [AccessService] })
export class AccessModule {}
