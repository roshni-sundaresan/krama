import type { Role as DbRole } from "@prisma/client";
import type { Role } from "@krama/shared";

export const toRoles = (roles: DbRole[]): Role[] => roles as Role[];
