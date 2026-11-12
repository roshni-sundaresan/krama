/** Extract the first x.y(.z) version from tool output, e.g. "git version 2.43.0" -> "2.43.0". */
export function parseVersion(output: string): string | null {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(output);
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3] ?? "0"}`;
}

/** Compare two x.y.z versions. Returns negative, zero or positive. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
