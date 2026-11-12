import { z } from "zod";

/** Platform roles. A user may hold several. Challenger is strictly read-only. */
export const ROLES = ["BA", "Developer", "LeadArchitect", "Approver", "Admin", "Challenger"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** Roles allowed to approve phase gates (requirements, documents). */
export const APPROVER_ROLES: readonly Role[] = ["Approver", "Admin"];
/** Roles allowed to edit guardrails and decide exception requests. */
export const GUARDRAIL_ADMIN_ROLES: readonly Role[] = ["LeadArchitect", "Admin"];

export function hasAnyRole(userRoles: readonly Role[], allowed: readonly Role[]): boolean {
  return userRoles.includes("Admin") || userRoles.some((r) => allowed.includes(r));
}

/** True when the user can only read (Challenger with no other role). */
export function isReadOnly(userRoles: readonly Role[]): boolean {
  return userRoles.length > 0 && userRoles.every((r) => r === "Challenger");
}

/** Claims carried in the API JWT. */
export interface KramaJwtClaims {
  sub: string;
  tenantId: string;
  email: string;
  name: string;
  roles: Role[];
}
