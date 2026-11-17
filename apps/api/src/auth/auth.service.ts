import { ForbiddenException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { User } from "@prisma/client";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { isAllowedEmail, type KramaJwtClaims, type Role } from "@krama/shared";
import { fail } from "../common/errors.js";
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

  async issue(user: User): Promise<IssuedToken> {
    const claims: KramaJwtClaims = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      roles: toRoles(user.roles),
    };
    const token = await this.jwt.signAsync({ ...claims }, { expiresIn: this.config.API_JWT_TTL as never });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastSignInAt: new Date() } });
    return { token, user: { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, roles: claims.roles } };
  }

  /** Mock login for local development (AUTH_DEV_LOGIN=true). */
  async devLogin(email: string): Promise<IssuedToken> {
    if (!this.config.AUTH_DEV_LOGIN) throw new ForbiddenException("Dev login is disabled");
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: this.config.DEFAULT_TENANT_SLUG } });
    if (!tenant) throw new UnauthorizedException("Default tenant missing — run the seed script");
    if (!isAllowedEmail(email, this.config.DEV_EXTRA_EMAIL_DOMAINS)) {
      await this.audit.record({ tenantId: tenant.id, actorType: "system", action: "auth.refused", entityType: "user", data: { email, reason: "domain" } });
      fail("MSG-AUTH-02", HttpStatus.FORBIDDEN);
    }
    const user = await this.prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } });
    if (!user || !user.active) throw new UnauthorizedException("Unknown or disabled user");
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "auth.dev_login", entityType: "user", entityId: user.id });
    return this.issue(user);
  }

  /**
   * Exchange a Microsoft Entra ID id_token (obtained by the web app via Auth.js) for a Krama API token.
   * Verifies signature (JWKS), issuer and audience. Only @idealake.com accounts are accepted (BRD-RBAC-01).
   * Roles are managed in Krama by the Super Admin; a first-time user is created with no roles.
   */
  async entraExchange(idToken: string): Promise<IssuedToken> {
    const { ENTRA_TENANT_ID, ENTRA_CLIENT_ID } = this.config;
    if (!ENTRA_TENANT_ID || !ENTRA_CLIENT_ID) throw new ForbiddenException("Entra ID is not configured");
    this.jwks ??= createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/v2.0/keys`));
    let payload: JWTPayload & { email?: string; preferred_username?: string; name?: string; oid?: string; tid?: string };
    try {
      ({ payload } = await jwtVerify(idToken, this.jwks, {
        issuer: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0`,
        audience: ENTRA_CLIENT_ID,
      }));
    } catch {
      fail("MSG-AUTH-01", HttpStatus.UNAUTHORIZED);
    }
    const tenant =
      (await this.prisma.tenant.findUnique({ where: { entraTenantId: payload.tid ?? ENTRA_TENANT_ID } })) ??
      (await this.prisma.tenant.findUnique({ where: { slug: this.config.DEFAULT_TENANT_SLUG } }));
    if (!tenant) throw new UnauthorizedException("No Krama tenant mapped to this directory");
    const email = (payload.email ?? payload.preferred_username ?? "").toLowerCase();
    if (!isAllowedEmail(email)) {
      await this.audit.record({ tenantId: tenant.id, actorType: "system", action: "auth.refused", entityType: "user", data: { email, reason: "domain" } });
      fail("MSG-AUTH-02", HttpStatus.FORBIDDEN);
    }
    const user = await this.prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      create: { tenantId: tenant.id, email, name: payload.name ?? email, roles: [], entraObjectId: payload.oid },
      update: { name: payload.name ?? email, entraObjectId: payload.oid },
    });
    if (!user.active) throw new UnauthorizedException("User is disabled");
    await this.audit.record({ tenantId: tenant.id, actorId: user.id, action: "auth.entra_login", entityType: "user", entityId: user.id });
    return this.issue(user);
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
