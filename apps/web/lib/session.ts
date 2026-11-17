import "server-only";
import { redirect } from "next/navigation";
import { can as canDo, type Permission, type Role } from "@krama/shared";
import { auth } from "@/auth";
import { api } from "@/lib/api";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
}

/** Current user with roles read live from the API (a revoked role disappears at once). */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  return api<CurrentUser>("/auth/me");
}

/** UI hint only — the API enforces every permission. */
export const can = (user: CurrentUser, p: Permission) => canDo(user.roles, p);
