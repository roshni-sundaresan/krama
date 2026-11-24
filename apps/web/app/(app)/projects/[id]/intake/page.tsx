import Link from "next/link";
import { Fragment } from "react";
import { ActionsMenu } from "@/components/menu";
import { DOC_TAGS, DOC_TAG_LABELS, DOMAIN_LABELS, ENTITY_LABELS, type DocTag } from "@krama/shared";
import { confirmMasking, importIdhi, startDraft, tagSource, updateIntake, uploadSource } from "@/app/actions";
import { IntakeForm } from "@/components/intake-form";
import { Chip, Empty, Flash, LEVEL_LABEL, NotFound, PageHead, one, type SP } from "@/components/ui";
import { api, load } from "@/lib/api";
import { fmtDay } from "@/lib/format";
import { can, requireUser } from "@/lib/session";
import type { Project, Readiness, Source } from "@/lib/types";

export default async function IntakePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const openId = one(sp.tag) ?? one(sp.view);
  const openKind = one(sp.tag) ? "tag" : "view";
  const user = await requireUser();
  const p = await load<Project>(`/projects/${id}`);
  if (!p) return <NotFound />;
  const edit = can(user, "intake.edit");
  const [sources, readiness, meetings, brd] = await Promise.all([
    api<Source[]>(`/projects/${id}/sources`),
    api<Readiness>(`/projects/${id}/readiness`),
    edit ? api<{ id: string; title: string; date: string }[]>(`/integrations/idhi/meetings`).catch(() => []) : Promise.resolve([]),
    api<{ document: { status: string } | null }>(`/projects/${id}/brd`),
  ]);
  const imported = new Set(sources.map((s) => s.externalRef).filter(Boolean));
  const openMeetings = meetings.filter((m) => !imported.has(m.id));
  const failing = readiness.rules.filter((r) => !r.passed && r.level !== "WARN");
  const advice = readiness.rules.filter((r) => !r.passed && r.level === "WARN");
  const team = (role: string) => p.members.filter((m) => m.user.roles.includes(role as never)).map((m) => m.user.name).join(", ") || "Not assigned";

  return (
    <>
      <PageHead eyebrow={`${p.name} · Requirements`} title="Intake pack">
        <Chip tone={readiness.ready ? "ok" : "warn"}>{readiness.ready ? `Ready for BRD drafting${advice.length ? ` · ${advice.length} suggestion${advice.length === 1 ? "" : "s"}` : ""}` : `Readiness: ${failing.length} item${failing.length === 1 ? "" : "s"} needed`}</Chip>
        {can(user, "brd.draft") &&
          (brd.document ? (
            <Link href={`/projects/${id}/brd`} className="btn primary">Open BRD</Link>
          ) : (
            <form action={startDraft.bind(null, id)}>
              <button className="btn primary" disabled={!readiness.ready} aria-disabled={!readiness.ready} title={readiness.ready ? undefined : "Clear the readiness items first"}>Start BRD drafting</button>
            </form>
          ))}
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)" }}>
        <section className="card col" style={{ gap: 14 }}>
          <h2>Project intake form</h2>
          <dl className="kv">
            <dt>Project code</dt><dd>{p.code}</dd>
            <dt>Client</dt><dd>{p.clientName}</dd>
            <dt>Domain</dt><dd>{DOMAIN_LABELS[p.domain]}{p.entityType ? ` · ${ENTITY_LABELS[p.entityType]}` : ""} · {p.domainConfirmed ? "confirmed by Tech Architect" : "Tech Architect confirms at stack selection"}</dd>
            <dt>New or existing</dt><dd>{p.existingProduction ? "Changes an existing client production system" : "New project"}</dd>
            <dt>Platforms</dt><dd>{p.platforms.join(", ")}</dd>
            <dt>SOW reference</dt><dd>{p.sowReference ?? "—"}</dd>
            <dt>Client sign-off owner</dt><dd>{p.clientSignoffOwner ?? "—"}</dd>
            <dt>BA / BA Lead</dt><dd>{team("BA")} / {team("BALead")}</dd>
            <dt>Regulations</dt><dd>{p.regulations ?? "—"}</dd>
            <dt>Known integrations</dt><dd>{p.integrations ?? "—"}</dd>
            <dt>Flags</dt><dd>{[p.government && "Government", p.accessibilityRequired && "Accessibility"].filter(Boolean).join(", ") || "None"}</dd>
          </dl>
          {edit && (
            <details>
              <summary className="btn sm" style={{ listStyle: "none", display: "inline-flex" }}>Edit intake form</summary>
              <div style={{ marginTop: 14 }}><IntakeForm action={updateIntake.bind(null, id)} values={p} submit="Save intake form" lockCode /></div>
            </details>
          )}
        </section>

        <section className="card col">
          <div className="between"><h2>Readiness check</h2><span className="tiny muted">2 required · 3 recommended</span></div>
          <table className="t">
            <tbody>
              {readiness.rules.map((r) => (
                <tr key={r.id}>
                  <td className="small"><b>{r.id}</b> {r.title}<div className="tiny muted">{LEVEL_LABEL[r.level]}</div></td>
                  <td style={{ textAlign: "right" }}><Chip tone={r.passed ? "ok" : r.level === "NON_WAIVABLE" ? "block" : r.level === "WARN" ? "grey" : "warn"}>{r.passed ? "Pass" : r.note}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tiny muted" style={{ margin: 0 }}>Personal data is masked in Krama before any AI step. Only the masked copy is sent to AI.</p>
        </section>
      </div>

      <section className="card flush">
        <div className="between" style={{ padding: "16px 20px" }}>
          <h2>Inputs</h2>
          {edit && (
            <div className="row">
              {openMeetings.length > 0 && (
                <form action={importIdhi.bind(null, id)} className="row" style={{ gap: 6 }}>
                  <label className="sr-only" htmlFor="meetingId">iDhi meeting</label>
                  <select id="meetingId" name="meetingId" className="input" style={{ width: 260 }}>
                    {openMeetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                  <button className="btn">Import from iDhi</button>
                </form>
              )}
              <form action={uploadSource.bind(null, id)} className="row" style={{ gap: 6 }}>
                <label className="sr-only" htmlFor="file">File</label>
                <input id="file" type="file" name="file" required className="small" accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.wsdl,.xsd,.json,.yaml,.yml,.zip" />
                <button className="btn">Upload file</button>
              </form>
            </div>
          )}
        </div>
        {sources.length === 0 ? (
          <div style={{ padding: "0 20px 20px" }}><Empty>No inputs yet. Upload the SOW and at least one MOM or client document.</Empty></div>
        ) : (
          <table className="t">
            <thead><tr><th>File</th><th>Type</th><th>Version / date</th><th>Provided by</th><th>Personal data</th><th>Status</th><th /></tr></thead>
            <tbody>
              {sources.map((s) => {
                const tagged = Boolean(s.docType && s.version && s.docDate && s.provider);
                const pii = s.piiFindings.reduce((n, f) => n + f.count, 0);
                const needsMask = s.personalData && !s.maskingConfirmedAt;
                const open = openId === s.id ? openKind : null;
                return (
                  <Fragment key={s.id}>
                    <tr>
                      <td>
                        <span style={{ fontWeight: 600 }}>{s.title}</span>
                        <div className="tiny muted">{s.kind === "IDHI_MEETING" ? "iDhi meeting" : "Upload"} · added {fmtDay(s.createdAt)}</div>
                        {s.injectionFlags.length > 0 && <div className="tiny" style={{ color: "#a12a26" }}>Instruction-like text found; Krama treats it as data only.</div>}
                      </td>
                      <td>{s.docType ? DOC_TAG_LABELS[s.docType as DocTag] : <Chip tone="warn">Not tagged</Chip>}</td>
                      <td className="small">{s.version ? `v${s.version}` : "—"}{s.docDate ? ` · ${s.docDate}` : ""}</td>
                      <td className="small">{s.provider ?? "—"}</td>
                      <td className="small">
                        {s.personalData ? (s.maskingConfirmedAt ? "Yes, masked" : "Yes, review masking") : "No"}
                        {pii > 0 && <div className="tiny muted">{s.piiFindings.map((f) => `${f.type} ${f.count}`).join(", ")} masked</div>}
                      </td>
                      <td>{!tagged ? <Chip tone="warn">Tag document</Chip> : needsMask ? <Chip tone="block">Confirm masking</Chip> : <Chip tone="ok">Read</Chip>}</td>
                      <td style={{ textAlign: "right" }}>
                        <ActionsMenu label={`Actions for ${s.title}`}>
                          {edit && <Link className="menu-item" role="menuitem" href={`/projects/${id}/intake?tag=${s.id}`}>{tagged ? "Edit tags" : "Tag document"}</Link>}
                          <Link className="menu-item" role="menuitem" href={`/projects/${id}/intake?view=${s.id}`}>{needsMask ? "Review masked copy" : "View masked copy"}</Link>
                          {s.kind === "UPLOAD" && s.sizeBytes ? <a className="menu-item" role="menuitem" href={`/api/download?path=${encodeURIComponent(`/projects/${id}/sources/${s.id}/file`)}`}>Download original</a> : null}
                          {edit && needsMask && (
                            <>
                              <div className="menu-sep" />
                              <form action={confirmMasking.bind(null, id, s.id)}><button className="menu-item" role="menuitem">Confirm masking</button></form>
                            </>
                          )}
                        </ActionsMenu>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={7} style={{ background: "#f8fafd" }}>
                          {open === "tag" && edit ? (
                            <form action={tagSource.bind(null, id, s.id)} className="row" style={{ gap: 8, alignItems: "flex-end" }}>
                              <label className="f" style={{ minWidth: 200 }}>Document type
                                <select name="docType" className="input" defaultValue={s.docType ?? ""} required>
                                  <option value="" disabled>Choose</option>
                                  {DOC_TAGS.map((t) => <option key={t} value={t}>{DOC_TAG_LABELS[t]}</option>)}
                                </select>
                              </label>
                              <label className="f" style={{ width: 110 }}>Version<input name="version" className="input" required defaultValue={s.version ?? ""} /></label>
                              <label className="f" style={{ width: 170 }}>Date<input name="docDate" type="date" className="input" required defaultValue={s.docDate ?? ""} /></label>
                              <label className="f" style={{ minWidth: 180 }}>Provided by<input name="provider" className="input" required defaultValue={s.provider ?? ""} /></label>
                              <label className="row small" style={{ gap: 6, paddingBottom: 10 }}><input type="checkbox" name="personalData" defaultChecked={s.personalData || pii > 0} /> Contains personal data</label>
                              <button className="btn primary">Save tags</button>
                              <Link className="btn" href={`/projects/${id}/intake`}>Cancel</Link>
                            </form>
                          ) : (
                            <div className="col" style={{ gap: 8 }}>
                              <span className="small"><b>Masked copy</b> · this is the only text Krama sends to AI</span>
                              <div className="code" style={{ maxHeight: 220, overflow: "auto" }}>{s.maskedText.slice(0, 3000)}</div>
                              <div className="row">
                                {edit && needsMask && <form action={confirmMasking.bind(null, id, s.id)}><button className="btn sm primary">I have checked the masked copy</button></form>}
                                <Link className="btn sm" href={`/projects/${id}/intake`}>Close</Link>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
