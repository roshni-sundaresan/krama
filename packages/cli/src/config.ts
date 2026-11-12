import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface KramaConfig {
  server: string;
  token: string;
}

export function configDir(): string {
  return process.env.KRAMA_CONFIG_DIR ?? join(homedir(), ".config", "krama");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function saveConfig(cfg: KramaConfig): string {
  mkdirSync(configDir(), { recursive: true });
  const p = configPath();
  writeFileSync(p, JSON.stringify({ server: cfg.server.replace(/\/+$/, ""), token: cfg.token }, null, 2));
  try {
    chmodSync(p, 0o600);
  } catch {
    /* best effort on Windows */
  }
  return p;
}

export function loadConfig(): KramaConfig {
  const p = configPath();
  if (!existsSync(p)) throw new Error(`Not logged in. Run: krama login --server <url> --token <token>`);
  return JSON.parse(readFileSync(p, "utf8")) as KramaConfig;
}

/** Directory inside the developer's repo where the context pack lives. */
export const KRAMA_DIR = ".krama";
