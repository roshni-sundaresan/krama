import { spawnSync } from "node:child_process";

export interface ExecResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run a command without a shell (except on Windows where tools are often .cmd shims). */
export function exec(command: string, args: string[], opts: { cwd?: string; inherit?: boolean } = {}): ExecResult {
  const r = spawnSync(command, args, {
    cwd: opts.cwd,
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : "pipe",
    shell: process.platform === "win32",
    timeout: opts.inherit ? undefined : 15_000,
  });
  return {
    ok: !r.error && r.status === 0,
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? (r.error ? String(r.error.message) : ""),
  };
}

/** Probe `<tool> --version`; returns the raw output or null when the tool is absent. */
export type VersionProbe = (command: string) => string | null;

export const defaultProbe: VersionProbe = (command) => {
  const r = exec(command, ["--version"]);
  if (!r.ok) return null;
  return (r.stdout || r.stderr).trim();
};
