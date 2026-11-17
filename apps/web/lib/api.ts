import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getToken } from "next-auth/jwt";

export const API_URL = process.env.KRAMA_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

/** Read the Krama API token from the encrypted Auth.js session cookie (server-side only). */
export async function apiToken(): Promise<string> {
  const h = await headers();
  const secureCookie = (process.env.AUTH_URL ?? "").startsWith("https://");
  const jwt = await getToken({ req: { headers: h }, secret: process.env.AUTH_SECRET, secureCookie });
  if (!jwt?.apiToken) redirect("/sign-in");
  return jwt.apiToken;
}

export async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await apiToken();
  return fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await raw(path, init);
  if (res.status === 401) redirect("/sign-in");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[]; code?: string; issues?: { path: string; message: string }[] };
    const msg = body.issues?.length
      ? body.issues.map((i) => `${i.path}: ${i.message}`).join("; ")
      : Array.isArray(body.message)
        ? body.message.join("; ")
        : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg, body.code);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const post = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });
export const patch = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });

/** Load data for a page; a 404 shows "not found" instead of crashing (BRD-RBAC-05). */
export async function load<T>(path: string): Promise<T | null> {
  try {
    return await api<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
