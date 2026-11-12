import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { Role } from "@krama/shared";

/** The authenticated principal attached to every request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  roles: Role[];
}

export type AuthedRequest = Request & { user?: AuthUser };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error("CurrentUser used on an unauthenticated route");
  return req.user;
});

export const IS_PUBLIC = "krama:isPublic";
/** Skip JWT auth (dev login, health, internal callbacks guarded separately). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = "krama:roles";
/** Restrict a route to users holding any of these roles (Admin always passes). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
