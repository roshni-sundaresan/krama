import "server-only";
import { redirect } from "next/navigation";
import { hasAnyRole, type Role } from "@krama/shared";
import { auth } from "@/auth";

export interface CurrentUser {
  name: string;
  email: string;
  roles: Role[];
}

export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  return { name: session.user.name ?? "", email: session.user.email ?? "", roles: session.user.roles ?? [] };
}

/** UI hint only — the API enforces every permission. */
export const can = (user: CurrentUser, ...roles: Role[]) => hasAnyRole(user.roles, roles);
