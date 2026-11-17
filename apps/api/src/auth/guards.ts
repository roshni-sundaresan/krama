import { HttpStatus, Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { timingSafeEqual } from "node:crypto";
import { can, RoleSchema, type KramaJwtClaims, type Permission, type Role } from "@krama/shared";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { IS_PUBLIC, PERMISSION_KEY, type AuthedRequest } from "../common/auth-user.js";
import { fail } from "../common/errors.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";

/**
 * Global guard: requires a valid Krama API JWT unless the route is @Public().
 * Roles are re-read from the database on every request, so a revoked role takes effect at the
 * user's next request (BRD-RBAC-02) and a disabled user is locked out immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Missing bearer token");
    let claims: KramaJwtClaims;
    try {
      claims = await this.jwt.verifyAsync<KramaJwtClaims>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    const user = await this.prisma.user.findFirst({ where: { id: claims.sub, tenantId: claims.tenantId } });
    if (!user || !user.active) throw new UnauthorizedException("User is disabled");
    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      roles: (user.roles as string[]).filter((r): r is Role => RoleSchema.safeParse(r).success),
    };
    return true;
  }
}

/** Global guard: enforces @RequirePermission(...) on the server and logs refusals. */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (permission && !can(user.roles, permission)) {
      await this.audit.record({
        tenantId: user.tenantId,
        actorId: user.id,
        action: "access.denied",
        entityType: "route",
        entityId: `${req.method} ${req.route?.path ?? req.path}`,
        data: { permission },
      });
      fail("MSG-AUTH-03", HttpStatus.FORBIDDEN);
    }
    return true;
  }
}

/** Guards worker → API callbacks with a shared secret header. */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const given = Buffer.from(String(req.headers["x-krama-internal-token"] ?? ""));
    const expected = Buffer.from(this.config.INTERNAL_API_TOKEN);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException("Invalid internal token");
    }
    return true;
  }
}
