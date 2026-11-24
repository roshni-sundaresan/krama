import Link from "next/link";
import type { Vertical } from "@krama/shared";
import { createGuardrailDraft } from "@/app/actions";
import { DownloadMenu, wordPdf } from "@/components/menu";
import { Chip, Flash, PageHead, type SP } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { GuardrailVersionSummary } from "@/lib/types";

interface VerticalRow {
  vertical: Vertical;
  label: string;
  canManage: boolean;
  liveVersion: number;
  ruleCount: number;
  draft: GuardrailVersionSummary | null;
  history: GuardrailVersionSummary[];
}

const OWNERS: Record<Vertical, string> = {
  TECHNOLOGY: "Tech Architect",
  INFRASTRUCTURE: "Tech Architect, Infrastructure Lead",
  BA: "Tech Architect, BA Lead",
  DESIGN: "Tech Architect, UI-UX Lead",
  TESTING: "Tech Architect, Lead Tester",
};

const STATUS_TONE = { PUBLISHED: "ok", SUPERSEDED: "grey", DISCARDED: "grey", DRAFT: "warn" } as const;

export default async function GuardrailsPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const rows = await api<VerticalRow[]>("/guardrails/versions");
  const any = rows.some((r) => r.canManage);

  return (
    <>
      <PageHead eyebrow="Admin" title="Guardrail management" />
      <p className="muted" style={{ margin: "-10px 0 0" }}>
        Each vertical&apos;s lead keeps its master guardrails current: edit, add or retire rules, or upload a revised Word or PDF, then publish with a change note. New and regenerated project packs use the published version; approved packs keep the rules they were approved with.
      </p>
      <Flash searchParams={searchParams} />
      {!any && <div className="notice warn">You can view and download every version. Only each vertical&apos;s owner can start a new version.</div>}

      {rows.map((r) => (
        <section key={r.vertical} className="card flush">
          <div className="between" style={{ padding: "16px 20px" }}>
            <div className="col" style={{ gap: 4 }}>
              <h2>{r.label} guardrails</h2>
              <span className="small muted">Live: v{r.liveVersion} · {r.ruleCount} rules · Owner: {OWNERS[r.vertical]}</span>
            </div>
            <span className="row" style={{ gap: 8 }}>
              {r.draft ? (
                <Link className="btn sm primary" href={`/guardrails/${r.draft.id}`}>{r.canManage ? `Continue draft v${r.draft.version}` : `View draft v${r.draft.version}`}</Link>
              ) : r.canManage ? (
                <form action={createGuardrailDraft.bind(null, r.vertical)}>
                  <button className="btn sm primary">Start new version</button>
                </form>
              ) : null}
            </span>
          </div>
          <table className="t">
            <thead><tr><th>Version</th><th>Status</th><th>Change note</th><th>Rules</th><th>Published</th><th>Document</th><th /></tr></thead>
            <tbody>
              {r.history.length === 0 && (
                <tr><td>v1</td><td><Chip tone="ok">Published</Chip></td><td className="small muted">Built-in master catalogue</td><td>{r.liveVersion === 1 ? r.ruleCount : "—"}</td><td className="small muted">—</td><td className="small muted">—</td><td /></tr>
              )}
              {r.history.map((h) => (
                <tr key={h.id}>
                  <td><Link href={`/guardrails/${h.id}`}><b>v{h.version}</b></Link></td>
                  <td><Chip tone={STATUS_TONE[h.status]}>{h.status === "PUBLISHED" ? "Live" : h.status.toLowerCase()}</Chip></td>
                  <td className="small">{h.changeNote || <span className="muted">—</span>}</td>
                  <td className="small">{h.ruleCount}{h.retiredCount ? <span className="muted"> · {h.retiredCount} retired</span> : null}</td>
                  <td className="small">{h.publishedBy ? <>{h.publishedBy}<div className="tiny muted">{h.publishedAt ? fmtDate(h.publishedAt) : ""}</div></> : <span className="muted">—</span>}</td>
                  <td className="small">{h.document ? <a href={`/api/download?path=${encodeURIComponent(`/guardrails/versions/${h.id}/document`)}`}>{h.document.name}</a> : <span className="muted">—</span>}</td>
                  <td>{h.status !== "DISCARDED" && <DownloadMenu items={wordPdf(`/guardrails/versions/${h.id}/download`)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
