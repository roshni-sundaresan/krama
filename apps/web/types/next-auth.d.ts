import type { Role } from "@krama/shared";

declare module "next-auth" {
  interface User {
    roles?: Role[];
    apiToken?: string;
  }
  interface Session {
    user: { name?: string | null; email?: string | null; image?: string | null; roles: Role[] };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    apiToken?: string;
    roles?: Role[];
  }
}
