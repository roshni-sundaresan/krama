import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),

  API_JWT_SECRET: z.string().min(16, "API_JWT_SECRET must be at least 16 chars"),
  API_JWT_TTL: z.string().default("8h"),
  CLI_JWT_TTL: z.string().default("7d"),
  /** Enables POST /auth/dev-login (mock login). Never enable in production. */
  AUTH_DEV_LOGIN: bool,
  DEFAULT_TENANT_SLUG: z.string().default("idealake"),

  /** Entra ID token exchange (POST /auth/entra/exchange). */
  ENTRA_TENANT_ID: z.string().optional(),
  ENTRA_CLIENT_ID: z.string().optional(),

  /** Shared secret for worker → API callbacks. */
  INTERNAL_API_TOKEN: z.string().min(16, "INTERNAL_API_TOKEN must be at least 16 chars"),

  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().default("default"),

  /** "s3" (MinIO / S3) or "local" (filesystem, dev only). */
  STORAGE_DRIVER: z.enum(["s3", "local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".data/uploads"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("ap-south-1"),
  S3_BUCKET: z.string().default("krama-sources"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,

  /** "mock" (canned meetings) or "http" (real iDhi API — TODO). */
  IDHI_MODE: z.enum(["mock", "http"]).default("mock"),
  IDHI_BASE_URL: z.string().optional(),
  IDHI_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (!cached) {
    const parsed = EnvSchema.safeParse(env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid API configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests. */
export function resetConfig(): void {
  cached = undefined;
}

export const APP_CONFIG = Symbol("APP_CONFIG");
