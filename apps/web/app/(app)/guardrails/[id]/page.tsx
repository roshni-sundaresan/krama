import Link from "next/link";
import { TOPIC_LABELS, VERTICAL_LABELS, type Vertical } from "@krama/shared";
import { discardGuardrailDraft, publishGuardrails, saveGuardrailDraft, uploadGuardrailDocument } from "@/app/actions";
import { DownloadMenu, wordPdf } from "@/components/menu";
import { Chip, Flash, LEVEL_LABEL, NotFound, PageHead, levelTone, type SP } from "@/components/ui";
import { load } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { GuardrailVersionDetail } from "@/lib/types";

const NEW_ROWS = 3;
const LEVELS = ["NON_WAIVABLE", "BLOCK", "WARN"] as const;

export default async function GuardrailVersionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await requireUser();
  const { id } = await params;
  const v = await load<GuardrailVersionDetail>(`/guardrails/versions/${id}`);
  if (!v) return <NotFound what="guardrail version" />;
  const label = VERTICAL_LABELS[v.vertical as Vertical];
  const editable = v.status === "DRAFT" && v.canManage;
  const topics = [...new Set([...v.rules.map((r) => r.topic), ...Object.keys(TOPIC_LABELS)])];
  const active = v.rules.filter((r) => !r.retired).length;

  return (
    <>
      <PageHead eyebrow={<><Link href="/guardrails">Guardrail management</Link> · {label}</>} title={`${label} guardrails v${v.version}`}>
        <Chip tone={v.status === "DRAFT" ? "warn" : v.status === "PUBLISHED" ? "ok" : "grey"}>{v.status === "PUBLISHED" ? "Live" : v.status.toLowerCase()}</Chip>
        {v.status !== "DISCARDED" && <DownloadMenu items={wordPdf(`/guardrails/versions/${v.id}/download`)} />}
      </PageHead>
      <p className="muted" style={{ margin: "-10px 0 0" }}>
        {active} active rules{v.retiredCount ? ` · ${v.retiredCount} retired` : ""} · started by {v.createdBy} on {fmtDate(v.createdAt)}
        {v.publishedBy ? ` · published by ${v.publishedBy} on ${fmtDate(v.publishedAt)}` : ""}
      </p>
      <Flash searchParams={searchParams} />
      {v.status === "DRAFT" && !v.canManage && <div className="notice warn">This draft is open for the {label} owner. You can view and download it.</div>}

      {editable && (
        <div className="grid2">
          <section className="card col">
            <h2>Publish this version</h2>
            <p className="small muted" style={{ margin: 0 }}>Save your rule edits below first. Publishing makes v{v.version} live; the current version is kept in the history.</p>
            <form action={publishGuardrails.bind(null, v.id)} className="col">
              <label className="small" htmlFor="pub-note"><b>Change note</b> (what changed and why)</label>
              <textarea id="pub-note" name="changeNote" className="input" required minLength={10} maxLength={2000} defaultValue={v.changeNote} placeholder="For example: added RBI 2026 directions to BFSI-G04; retired DES-G05" />
              <div className="row">
                <button className="btn primary">Publish v{v.version}</button>
              </div>
            </form>
            <form action={discardGuardrailDraft.bind(null, v.id)}>
              <button className="btn sm danger">Discard draft</button>
            </form>
          </section>
          <section className="card col">
            <h2>Revised guardrail document</h2>
            <p className="small muted" style={{ margin: 0 }}>Optional. Upload the revised standard as Word or PDF (up to 20 MB); it is scanned for malware and kept with this version.</p>
            {v.document && (
              <p className="small" style={{ margin: 0 }}>
                Attached: <a href={`/api/download?path=${encodeURIComponent(`/guardrails/versions/${v.id}/document`)}`}>{v.document.name}</a>
              </p>
            )}
            <form action={uploadGuardrailDocument.bind(null, v.id)} className="col">
              <label className="sr-only" htmlFor="gr-file">Guardrail document</label>
              <input id="gr-file" name="file" type="file" accept=".docx,.pdf" className="input" required />
              <div className="row"><button className="btn">{v.document ? "Replace document" : "Upload document"}</button></div>
            </form>
          </section>
        </div>
      )}

      {!editable && v.document && (
        <section className="card">
          <p className="small" style={{ margin: 0 }}>
            Guardrail document: <a href={`/api/download?path=${encodeURIComponent(`/guardrails/versions/${v.id}/document`)}`}>{v.document.name}</a>
          </p>
        </section>
      )}
      {!editable && v.changeNote && (
        <section className="card"><h3>Change note</h3><p className="small" style={{ margin: "6px 0 0" }}>{v.changeNote}</p></section>
      )}

      {editable ? (
        <form action={saveGuardrailDraft.bind(null, v.id)} className="card flush">
          <div className="between" style={{ padding: "16px 20px" }}>
            <h2>Rules</h2>
            <button className="btn primary sm">Save draft</button>
          </div>
          <input type="hidden" name="n" value={v.rules.length + NEW_ROWS} />
          <input type="hidden" name="changeNote" value={v.changeNote} />
          <table className="t">
            <thead><tr><th style={{ width: 110 }}>Rule</th><th style={{ width: 190 }}>Topic and level</th><th>Title and what it requires</th><th style={{ width: 160 }}>Sources</th><th style={{ width: 60 }}>Retire</th></tr></thead>
            <tbody>
              {v.rules.map((r, i) => (
                <tr key={r.id} style={r.retired ? { opacity: 0.55 } : undefined}>
                  <td>
                    <b>{r.id}</b>
                    <input type="hidden" name={`r${i}_id`} value={r.id} />
                    {r.check && <div className="tiny muted">Machine-checked</div>}
                  </td>
                  <td><div className="col" style={{ gap: 6 }}>
                    <label className="sr-only" htmlFor={`r${i}_topic`}>Topic for {r.id}</label>
                    <select id={`r${i}_topic`} name={`r${i}_topic`} className="input" defaultValue={r.topic}>
                      {topics.map((t) => <option key={t} value={t}>{TOPIC_LABELS[t] ?? t}</option>)}
                    </select>
                    <label className="sr-only" htmlFor={`r${i}_level`}>Level for {r.id}</label>
                    <select id={`r${i}_level`} name={`r${i}_level`} className="input" defaultValue={r.level}>
                      {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                    </select>
                  </div></td>
                  <td><div className="col" style={{ gap: 6 }}>
                    <label className="sr-only" htmlFor={`r${i}_title`}>Title for {r.id}</label>
                    <input id={`r${i}_title`} name={`r${i}_title`} className="input" defaultValue={r.title} required minLength={3} maxLength={120} />
                    <label className="sr-only" htmlFor={`r${i}_text`}>What {r.id} requires</label>
                    <textarea id={`r${i}_text`} name={`r${i}_text`} className="input" defaultValue={r.text} required minLength={10} maxLength={2000} />
                  </div></td>
                  <td>
                    <label className="sr-only" htmlFor={`r${i}_sources`}>Sources for {r.id}</label>
                    <input id={`r${i}_sources`} name={`r${i}_sources`} className="input" defaultValue={(r.sources ?? []).join(", ")} placeholder="e.g. OWASP-2025" />
                  </td>
                  <td>
                    <label className="row small" style={{ gap: 6 }}>
                      <input type="checkbox" name={`r${i}_retired`} defaultChecked={Boolean(r.retired)} />
                      <span className="sr-only">Retire {r.id}</span>
                    </label>
                  </td>
                </tr>
              ))}
              {Array.from({ length: NEW_ROWS }, (_, k) => {
                const i = v.rules.length + k;
                return (
                  <tr key={`new-${k}`}>
                    <td><span className="small muted">New rule</span></td>
                    <td><div className="col" style={{ gap: 6 }}>
                      <label className="sr-only" htmlFor={`r${i}_topic`}>Topic for new rule {k + 1}</label>
                      <select id={`r${i}_topic`} name={`r${i}_topic`} className="input" defaultValue={v.rules[0]?.topic}>
                        {topics.map((t) => <option key={t} value={t}>{TOPIC_LABELS[t] ?? t}</option>)}
                      </select>
                      <label className="sr-only" htmlFor={`r${i}_level`}>Level for new rule {k + 1}</label>
                      <select id={`r${i}_level`} name={`r${i}_level`} className="input" defaultValue="BLOCK">
                        {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                      </select>
                    </div></td>
                    <td><div className="col" style={{ gap: 6 }}>
                      <label className="sr-only" htmlFor={`r${i}_title`}>Title for new rule {k + 1}</label>
                      <input id={`r${i}_title`} name={`r${i}_title`} className="input" placeholder="Title (leave empty to skip)" maxLength={120} />
                      <label className="sr-only" htmlFor={`r${i}_text`}>What new rule {k + 1} requires</label>
                      <textarea id={`r${i}_text`} name={`r${i}_text`} className="input" placeholder="What the rule requires" maxLength={2000} />
                    </div></td>
                    <td>
                      <label className="sr-only" htmlFor={`r${i}_sources`}>Sources for new rule {k + 1}</label>
                      <input id={`r${i}_sources`} name={`r${i}_sources`} className="input" placeholder="e.g. SEBI-CSCRF" />
                    </td>
                    <td />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="between" style={{ padding: "12px 20px" }}>
            <span className="small muted">New rules get the next id for this vertical when saved. Retired rules stay in the history.</span>
            <button className="btn primary sm">Save draft</button>
          </div>
        </form>
      ) : (
        <section className="card flush">
          <div style={{ padding: "16px 20px" }}><h2>Rules ({active})</h2></div>
          <table className="t">
            <thead><tr><th>Rule</th><th>Level</th><th>What it requires</th><th>Source</th></tr></thead>
            <tbody>
              {v.rules.map((r) => (
                <tr key={r.id} style={r.retired ? { opacity: 0.55 } : undefined}>
                  <td><b>{r.id}</b><div className="small">{r.title}</div>{r.retired && <Chip tone="grey">Retired</Chip>}</td>
                  <td><Chip tone={levelTone(r.level)}>{LEVEL_LABEL[r.level]}</Chip></td>
                  <td className="small">{r.text}</td>
                  <td className="tiny muted">{(r.sources ?? []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
