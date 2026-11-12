import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative, isAbsolute } from "node:path";
import { CONTEXT_PACK_FILES, ContextPackSchema, type ContextPack } from "@krama/shared";
import { KRAMA_DIR, type KramaConfig } from "../config.js";

export async function fetchContextPack(cfg: KramaConfig, projectId: string): Promise<ContextPack> {
  const url = `${cfg.server}/api/projects/${encodeURIComponent(projectId)}/context-pack`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Context pack request failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  return ContextPackSchema.parse(await res.json());
}

/** Write the context pack into <cwd>/.krama/. Returns the written relative paths. */
export function writeContextPack(cwd: string, pack: ContextPack): string[] {
  const base = join(cwd, KRAMA_DIR);
  const files: Record<string, string> = {
    ...pack.files,
    [CONTEXT_PACK_FILES.guardrails]: JSON.stringify(pack.guardrails, null, 2),
    [CONTEXT_PACK_FILES.exceptions]: JSON.stringify(pack.exceptions, null, 2),
    [CONTEXT_PACK_FILES.checklist]: JSON.stringify(pack.checklist, null, 2),
    [CONTEXT_PACK_FILES.meta]: JSON.stringify(
      {
        schemaVersion: pack.schemaVersion,
        generatedAt: pack.generatedAt,
        project: pack.project,
        approvedTools: pack.approvedTools,
      },
      null,
      2,
    ),
  };
  const written: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const target = normalize(join(base, rel));
    const r = relative(base, target);
    if (r.startsWith("..") || isAbsolute(r)) throw new Error(`Refusing to write outside ${KRAMA_DIR}: ${rel}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    written.push(join(KRAMA_DIR, r));
  }
  return written.sort();
}

export async function pull(cfg: KramaConfig, projectId: string, cwd: string): Promise<string[]> {
  return writeContextPack(cwd, await fetchContextPack(cfg, projectId));
}
