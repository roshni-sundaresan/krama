import { z } from "zod";

/** Krama roles (BRD v0.6 section 10.1). A user may hold several. */
export const ROLES = [
  "SuperAdmin",
  "TechArchitect",
  "BALead",
  "BA",
  "UIUXLead",
  "Designer",
  "Developer",
  "LeadTester",
  "Tester",
  "InfraLead",
] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  SuperAdmin: "Super Admin",
  TechArchitect: "Tech Architect",
  BALead: "BA Lead",
  BA: "BA",
  UIUXLead: "UI-UX Lead",
  Designer: "Designer",
  Developer: "Developer",
  LeadTester: "Lead Tester",
  Tester: "Tester",
  InfraLead: "Infrastructure Lead",
};

/**
 * Every action Krama checks on the server. The web app uses the same map only to hide
 * buttons; the API enforces it (BRD-RBAC-06).
 */
export const PERMISSIONS = {
  "users.manage": ["SuperAdmin"],
  "project.create": ["BA", "BALead"],
  "project.viewAll": ["TechArchitect"],
  "intake.edit": ["BA", "BALead"],
  "brd.draft": ["BA", "BALead"],
  "brd.submit": ["BA", "BALead"],
  "brd.approve": ["BALead"],
  "signoff.record": ["BA", "BALead"],
  "domain.confirm": ["TechArchitect"],
  "stack.select": ["TechArchitect"],
  "pack.generate": ["TechArchitect"],
  "pack.approve": ["TechArchitect"],
  "pack.draftVertical": ["TechArchitect", "BALead", "UIUXLead", "LeadTester", "InfraLead"],
  "project.assign": ["TechArchitect"],
  "checklist.confirm": ["Developer"],
  "check.run": ["Developer", "TechArchitect"],
  "exception.request": ["Developer", "BA", "BALead"],
  "exception.decide": ["TechArchitect", "BALead"],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export function hasAnyRole(userRoles: readonly Role[], allowed: readonly Role[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}

export function can(userRoles: readonly Role[], permission: Permission): boolean {
  return hasAnyRole(userRoles, PERMISSIONS[permission]);
}

/** Only @idealake.com accounts may use Krama (BRD-RBAC-01). */
export const ALLOWED_EMAIL_DOMAIN = "idealake.com";
export function isAllowedEmail(email: string, extraDomains: readonly string[] = []): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return domain === ALLOWED_EMAIL_DOMAIN || extraDomains.includes(domain);
}

/** Claims carried in the API JWT. */
export interface KramaJwtClaims {
  sub: string;
  tenantId: string;
  email: string;
  name: string;
  roles: Role[];
}
