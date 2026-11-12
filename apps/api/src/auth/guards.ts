import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { timingSafeEqual } from "node:crypto";
import { hasAnyRole, isReadOnly, RoleSchema, type KramaJwtClaims, type Role } from "@krama/shared";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { IS_PUBLIC, ROLES_KEY, type AuthedRequest } from "../common/auth-user.js";

/** Global guard: requires a valid Krama API JWT unless the route is @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Missing bearer token");
    try {
      const claims = await this.jwt.verifyAsync<KramaJwtClaims>(token);
      req.user = {
        id: claims.sub,
        tenantId: claims.tenantId,
        email: claims.email,
        name: claims.name,
        roles: (claims.roles ?? []).filter((r): r is Role => RoleSchema.safeParse(r).success),
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}

/**
 * Global guard: enforces @Roles(...) and makes Challenger-only users read-only.
 * TODO: per-project membership checks (Phase 2).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    if (isReadOnly(user.roles) && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      throw new ForbiddenException("Challenger role is read-only");
    }
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required && required.length > 0 && !hasAnyRole(user.roles, required)) {
      throw new ForbiddenException(`Requires one of: ${required.join(", ")}`);
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
