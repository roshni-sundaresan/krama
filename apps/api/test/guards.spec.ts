import "reflect-metadata";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { Role } from "@krama/shared";
import { RolesGuard } from "../src/auth/guards.js";
import { ROLES_KEY } from "../src/common/auth-user.js";

function ctx(method: string, roles: Role[], required?: Role[]): ExecutionContext {
  const handler = () => undefined;
  if (required) Reflect.defineMetadata(ROLES_KEY, required, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ method, user: { id: "u", tenantId: "t", email: "e", name: "n", roles } }) }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector());

  it("allows any authenticated user when no roles are required", () => {
    expect(guard.canActivate(ctx("GET", ["Developer"]))).toBe(true);
  });

  it("enforces required roles, Admin always passes", () => {
    expect(() => guard.canActivate(ctx("PUT", ["Developer"], ["LeadArchitect"]))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx("PUT", ["LeadArchitect"], ["LeadArchitect"]))).toBe(true);
    expect(guard.canActivate(ctx("PUT", ["Admin"], ["LeadArchitect"]))).toBe(true);
  });

  it("makes Challenger read-only", () => {
    expect(guard.canActivate(ctx("GET", ["Challenger"]))).toBe(true);
    expect(() => guard.canActivate(ctx("POST", ["Challenger"]))).toThrow(/read-only/);
    // a Challenger who also holds another role is not restricted by the read-only rule
    expect(guard.canActivate(ctx("POST", ["Challenger", "BA"]))).toBe(true);
  });
});
