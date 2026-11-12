import type { DepthMode as DbDepthMode, Role as DbRole } from "@prisma/client";
import type { DepthMode, Role } from "@krama/shared";

export const toDepthMode = (m: DbDepthMode): DepthMode => m.toLowerCase() as DepthMode;
export const fromDepthMode = (m: DepthMode): DbDepthMode => m.toUpperCase() as DbDepthMode;
export const toRoles = (roles: DbRole[]): Role[] => roles as Role[];
