import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type { Role } from "@krama/shared";

const API_URL = process.env.KRAMA_API_URL ?? "http://localhost:4000";

interface IssuedToken {
  token: string;
  user: { id: string; tenantId: string; email: string; name: string; roles: Role[] };
}

async function postJson(path: string, body: unknown): Promise<IssuedToken | null> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return res.ok ? ((await res.json()) as IssuedToken) : null;
}

const providers: NextAuthConfig["providers"] = [];

// Entra ID SSO (production login). Enabled when its env vars are set.
if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
}

// Dev / mock login: exchanges a seeded user's email for an API token. Never enable in production.
if (process.env.NEXT_PUBLIC_DEV_LOGIN === "true") {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const issued = await postJson("/auth/dev-login", { email: String(credentials?.email ?? "") });
        if (!issued) return null;
        return { id: issued.user.id, email: issued.user.email, name: issued.user.name, roles: issued.user.roles, apiToken: issued.token };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  pages: { signIn: "/sign-in" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "microsoft-entra-id" && account.id_token) {
        const issued = await postJson("/auth/entra/exchange", { idToken: account.id_token });
        if (!issued) throw new Error("Krama API rejected the Entra ID token");
        token.apiToken = issued.token;
        token.roles = issued.user.roles;
        token.name = issued.user.name;
      } else if (user && "apiToken" in user) {
        token.apiToken = user.apiToken;
        token.roles = user.roles;
      }
      return token;
    },
    // The API token stays inside the encrypted JWT cookie; only roles/name reach the session.
    async session({ session, token }) {
      session.user.roles = (token.roles as Role[] | undefined) ?? [];
      return session;
    },
  },
});
