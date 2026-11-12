import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { User } from "@prisma/client";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { RoleSchema, type KramaJwtClaims, type Role } from "@krama/shared";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { toRoles } from "../common/mappers.js";

export interface IssuedToken {
  token: string;
  user: { id: string; tenantId: string; email: string; name: string; roles: Role[] };
}

@Injectable()
export class AuthService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issue(user: User, kind: "web" | "cli" = "web"): Promise<IssuedToken> {
    const claims: KramaJwtClaims = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      roles: toRoles(user.roles),
    };
    const token = await this.jwt.signAsync(
      { ...claims, kind },
      { expiresIn: (kind === "cli" ? this.config.CLI_JWT_TTL : this.config.API_JWT_TTL) as never },
    );
    return { token, user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, roles: claims.roles } };
  }

  /** Mock login for local development (AUTH_DEV_LOGIN=true). */
  async devLogin(email: string): Promise<IssuedToken> {
    if (!this.config.AUTH_DEV_LOGIN) throw new ForbiddenException("Dev login is disabled");
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: this.config.DEFAULT_TENANT_SLUG } });
    if (!tenant) throw new UnauthorizedException("Default tenant missing — run the seed script");
    const user = await this.prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } });
    if (!user || !user.active) throw new UnauthorizedException("Unknown user");
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "auth.dev_login", entityType: "user", entityId: user.id });
    return this.issue(user);
  }

  /**
   * Exchange a Microsoft Entra ID id_token (obtained by the web app via Auth.js) for a Krama API token.
   * Verifies signature (JWKS), issuer and audience. Roles come from Entra app roles (`roles` claim);
   * users without app roles get read-only Challenger access.
   */
  async entraExchange(idToken: string): Promise<IssuedToken> {
    const { ENTRA_TENANT_ID, ENTRA_CLIENT_ID } = this.config;
    if (!ENTRA_TENANT_ID || !ENTRA_CLIENT_ID) throw new ForbiddenException("Entra ID is not configured");
    this.jwks ??= createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/v2.0/keys`),
    );
    let payload: JWTPayload & { email?: string; preferred_username?: string; name?: string; oid?: string; tid?: string; roles?: string[] };
    try {
      ({ payload } = await jwtVerify(idToken, this.jwks, {
        issuer: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0`,
        audience: ENTRA_CLIENT_ID,
      }));
    } catch {
      throw new UnauthorizedException("Invalid Entra ID token");
    }
    const tenant =
      (await this.prisma.tenant.findUnique({ where: { entraTenantId: payload.tid ?? ENTRA_TENANT_ID } })) ??
      (await this.prisma.tenant.findUnique({ where: { slug: this.config.DEFAULT_TENANT_SLUG } }));
    if (!tenant) throw new UnauthorizedException("No Krama tenant mapped to this directory");
    const email = (payload.email ?? payload.preferred_username ?? "").toLowerCase();
    if (!email) throw new UnauthorizedException("Token has no email");
    const appRoles = (payload.roles ?? []).filter((r): r is Role => RoleSchema.safeParse(r).success);
    const roles: Role[] = appRoles.length ? appRoles : ["Challenger"];
    const user = await this.prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      create: { tenantId: tenant.id, email, name: payload.name ?? email, roles, entraObjectId: payload.oid },
      update: { name: payload.name ?? email, roles, entraObjectId: payload.oid },
    });
    if (!user.active) throw new UnauthorizedException("User is deactivated");
    await this.audit.record({ tenantId: tenant.id, actorId: user.id, action: "auth.entra_login", entityType: "user", entityId: user.id });
    return this.issue(user);
  }

  async cliToken(userId: string, tenantId: string): Promise<IssuedToken> {
    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, tenantId } });
    await this.audit.record({ tenantId, actorId: userId, action: "auth.cli_token_issued", entityType: "user", entityId: userId });
    return this.issue(user, "cli");
  }

  async devUsers() {
    if (!this.config.AUTH_DEV_LOGIN) throw new ForbiddenException("Dev login is disabled");
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: this.config.DEFAULT_TENANT_SLUG } });
    if (!tenant) return [];
    return this.prisma.user.findMany({
      where: { tenantId: tenant.id, active: true },
      select: { email: true, name: true, roles: true },
      orderBy: { email: "asc" },
    });
  }
}
