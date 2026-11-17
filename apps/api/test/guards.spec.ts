import "reflect-metadata";
import { HttpException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { Permission, Role } from "@krama/shared";
import { PermissionGuard } from "../src/auth/guards.js";
import { PERMISSION_KEY } from "../src/common/auth-user.js";
import { safeExtract } from "../src/dev/dev.module.js";
import AdmZip from "adm-zip";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function ctx(method: string, roles: Role[], permission?: Permission): ExecutionContext {
  const handler = () => undefined;
  if (permission) Reflect.defineMetadata(PERMISSION_KEY, permission, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ method, path: "/x", route: { path: "/x" }, user: { id: "u", tenantId: "t", email: "e", name: "n", roles } }) }),
  } as unknown as ExecutionContext;
}

describe("PermissionGuard", () => {
  const audit = { record: vi.fn(async () => undefined) };
  const guard = new PermissionGuard(new Reflector(), audit as never);

  it("allows any signed-in user when no permission is required", async () => {
    await expect(guard.canActivate(ctx("GET", ["Developer"]))).resolves.toBe(true);
  });

  it("refuses stack selection for a Developer with MSG-AUTH-03 and logs it", async () => {
    const err = await guard.canActivate(ctx("POST", ["Developer"], "stack.select")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(403);
    expect((err as HttpException).getResponse()).toMatchObject({ code: "MSG-AUTH-03" });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "access.denied" }));
  });

  it("allows a Tech Architect to select the stack and a BA Lead to approve a BRD", async () => {
    await expect(guard.canActivate(ctx("POST", ["TechArchitect"], "stack.select"))).resolves.toBe(true);
    await expect(guard.canActivate(ctx("POST", ["BALead"], "brd.approve"))).resolves.toBe(true);
  });

  it("does not let a Super Admin approve guardrail packs", async () => {
    await expect(guard.canActivate(ctx("POST", ["SuperAdmin"], "pack.approve"))).rejects.toBeInstanceOf(HttpException);
  });
});

describe("safeExtract", () => {
  it("extracts files and refuses paths outside the target", async () => {
    const ok = new AdmZip();
    ok.addFile("src/a.ts", Buffer.from("export const a = 1;"));
    const dir = await mkdtemp(join(tmpdir(), "t-"));
    expect(await safeExtract(ok.toBuffer(), join(dir, "repo"))).toBe(1);
    expect(await readdir(join(dir, "repo", "src"))).toEqual(["a.ts"]);

    const bad = new AdmZip();
    bad.addFile("x.ts", Buffer.from("x"));
    bad.getEntries()[0]!.entryName = "../../evil.ts";
    await expect(safeExtract(bad.toBuffer(), join(dir, "repo2"))).rejects.toThrow(/unsafe/);
  });
});
