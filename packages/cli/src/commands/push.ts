import { exec } from "../exec.js";

export function branchName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  return `krama-gen-${ts}`;
}

export interface PushOptions {
  cwd: string;
  message?: string;
  remote?: string;
  dryRun?: boolean;
}

/** Create krama-gen-<timestamp>, commit everything and push. Returns the branch name. */
export function push(opts: PushOptions): string {
  const git = (...args: string[]) => {
    if (opts.dryRun) {
      console.log(`[dry-run] git ${args.join(" ")}`);
      return;
    }
    const r = exec("git", args, { cwd: opts.cwd });
    if (!r.ok) throw new Error(`git ${args[0]} failed: ${r.stderr.trim() || r.stdout.trim()}`);
  };
  if (!opts.dryRun && !exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: opts.cwd }).ok) {
    throw new Error("Not inside a git repository.");
  }
  const branch = branchName();
  git("checkout", "-b", branch);
  git("add", "-A");
  git("commit", "-m", opts.message ?? `krama: generated changes (${branch})`);
  git("push", "-u", opts.remote ?? "origin", branch);
  return branch;
}
