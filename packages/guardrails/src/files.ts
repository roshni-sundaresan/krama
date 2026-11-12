import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  ".krama",
  "coverage",
  ".pytest_cache",
]);
const MAX_FILE_BYTES = 1_000_000;

export interface SourceFile {
  /** POSIX-style path relative to the scan root. */
  path: string;
  content: string;
  lines: string[];
}

/** Recursively collect text files under root, skipping vendored/build dirs and binaries. */
export function collectFiles(root: string): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (statSync(full).size > MAX_FILE_BYTES) continue;
      const buf = readFileSync(full);
      if (buf.subarray(0, 8000).includes(0)) continue; // binary
      const content = buf.toString("utf8");
      out.push({ path: toPosix(relative(root, full)), content, lines: content.split(/\r?\n/) });
    }
  };
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function toPosix(p: string): string {
  return p.split(sep).join(posix.sep);
}

const globCache = new Map<string, RegExp>();

/** Minimal glob matcher supporting `**`, `*` and `?`. Patterns without `/` match the basename. */
export function matchGlob(pattern: string, path: string): boolean {
  let re = globCache.get(pattern);
  if (!re) {
    let src = "";
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i]!;
      if (c === "*") {
        if (pattern[i + 1] === "*") {
          if (pattern[i + 2] === "/") {
            src += "(?:.*/)?";
            i += 2;
          } else {
            src += ".*";
            i += 1;
          }
        } else {
          src += "[^/]*";
        }
      } else if (c === "?") {
        src += "[^/]";
      } else {
        src += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      }
    }
    re = new RegExp(`^${src}$`);
    globCache.set(pattern, re);
  }
  const target = pattern.includes("/") ? path : (path.split("/").pop() ?? path);
  return re.test(target);
}

export function matchesAny(patterns: readonly string[], path: string): boolean {
  return patterns.length === 0 || patterns.some((p) => matchGlob(p, path));
}
