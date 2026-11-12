import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { assertCanDecide } from "../src/approvals/approvals.service.js";
import type { AuthUser } from "../src/common/auth-user.js";

const user = (roles: AuthUser["roles"], id = "approver"): AuthUser => ({ id, tenantId: "t", email: "e", name: "n", roles });

describe("approval policy", () => {
  it("only Approvers decide requirement/document gates", () => {
    const a = { subjectType: "REQUIREMENTS" as const, requestedById: "ba", status: "PENDING" as const };
    expect(() => assertCanDecide(user(["Approver"]), a)).not.toThrow();
    expect(() => assertCanDecide(user(["BA"]), a)).toThrow(/Requires/);
    expect(() => assertCanDecide(user(["LeadArchitect"]), a)).toThrow(/Requires/);
  });

  it("only Lead Architects decide guardrail exceptions", () => {
    const a = { subjectType: "EXCEPTION" as const, requestedById: "dev", status: "PENDING" as const };
    expect(() => assertCanDecide(user(["LeadArchitect"]), a)).not.toThrow();
    expect(() => assertCanDecide(user(["Approver"]), a)).toThrow(/Requires/);
  });

  it("enforces separation of duties and single decision", () => {
    expect(() =>
      assertCanDecide(user(["Admin"], "same"), { subjectType: "DOCUMENTS", requestedById: "same", status: "PENDING" }),
    ).toThrow(/own request/);
    expect(() =>
      assertCanDecide(user(["Approver"]), { subjectType: "DOCUMENTS", requestedById: "ba", status: "APPROVED" }),
    ).toThrow(/already/);
  });
});
