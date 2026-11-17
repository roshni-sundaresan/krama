import Link from "next/link";
import { decideBrd, recordSignoff, runAudit, withdrawSignoff } from "@/app/actions";
import { Chip, Empty, Flash, NotFound, PageHead, type SP, type Tone } from "@/components/ui";
import { load } from "@/lib/api";
import { fmtDate, human } from "@/lib/format";
import { can, requireUser } from "@/lib/session";
import type { Workspace } from "@/lib/types";

const STATUS_TONE: Record<string, Tone> = { READY_FOR_FSD: "ok", NEEDS_CLARIFICATION: "warn", BLOCKED_HIGH_RISK: "block" };
const LENS: Record<string, string> = { L1_SCOPE_AND_COST: "L1 Scope", L2_ACTORS_AND_TENANCY: "L2 Tenancy", L3_NEGATIVE_JOURNEYS: "L3 Negative", L4_GOVERNANCE: "L4 Governance", L5_DATA_MIGRATION: "L5 Migration", L6_PRAGMATIC_DEFAULTS: "L6 Defaults" };

export default async function AuditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const user = await requireUser();
  const ws = await load<Workspace>(`/projects/${id}/brd`);
  if (!ws) return <NotFound />;
  const { project: p, document: doc, audit, signoff } = ws;
  if (!doc || doc.status === "DRAFTING") {
    return (
      <>
        <PageHead eyebrow={`${p.name} · Requirements`} title="Deep Audit and approval" />
        <div className="card"><Empty>There is no BRD to audit yet. <Link href={`/projects/${id}/brd`}>Open the BRD</Link>.</Empty></div>
      </>
    );
  }
  const r = audit?.aiReport ?? null;
  const gaps = r?.adversarial_gap_matrix ?? [];
  const questions = [...(r?.sign_off_blocker_questions ?? [])].sort((a, b) => a.priority_rank - b.priority_rank);
  const rules = audit?.ruleFindings ?? [];
  const critical = (audit?.criticalCount ?? 0) + rules.filter((x) => x.severity === "CRITICAL_BLOCKER").length;
  const stale = audit && audit.documentVersion !== doc.version;

  const gate = (n: number, title: string, body: React.ReactNode, state: Tone, label: string) => (
    <li className="stmt" style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <span style={{ width: 26, height: 26, flex: "0 0 26px", borderRadius: 999, background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{n}</span>
      <div className="col" style={{ gap: 6, flex: 1 }}>
        <div className="between"><b>{title}</b><Chip tone={state}>{label}</Chip></div>
        {body}
      </div>
    </li>
  );

  return (
    <>
      <PageHead eyebrow={`${p.name} · BRD v${doc.version}`} title="Deep Audit and approval">
        <Link href={`/projects/${id}/brd`} className="btn">Back to BRD</Link>
        {audit && <a className="btn" href={`/api/audit/${id}`}>Download audit (JSON)</a>}
        {can(user, "brd.submit") && (doc.status === "DRAFT" || doc.status === "CHANGES_REQUESTED") && (
          <form action={runAudit.bind(null, id, doc.id)}><button className="btn">Run Deep Audit only</button></form>
        )}
      </PageHead>
      <Flash searchParams={searchParams} />
      {stale && <div className="notice warn">This audit ran on v{audit.documentVersion}. The BRD has changed since; submit again to re-run it.</div>}

      {!audit ? (
        <div className="card"><Empty>Deep Audit has not run yet. It runs when the BA submits the BRD, or with Run Deep Audit only.</Empty></div>
      ) : (
        <>
          <section className="grid4" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }} aria-label="Audit summary">
            <div className="card stat"><span className="small muted">Status</span><Chip tone={STATUS_TONE[audit.status]}>{audit.status}</Chip></div>
            <div className="card stat"><span className="small muted">Critical blockers</span><b>{critical}</b></div>
            <div className="card stat"><span className="small muted">Open gaps</span><b>{gaps.length}</b></div>
            <div className="card stat"><span className="small muted">Estimation risk</span><b style={{ fontSize: 22 }}>{r?.readiness_assessment?.estimation_risk_level ?? "—"}</b></div>
            <div className="card stat"><span className="small muted">Confidence (info only)</span><b>{r?.readiness_assessment?.confidence_score ?? "—"}</b></div>
          </section>
          {r?.readiness_assessment?.executive_summary && <p className="muted" style={{ margin: 0 }}>{r.readiness_assessment.executive_summary} Audit ran {fmtDate(audit.createdAt)}.</p>}

          <section className="card flush">
            <div className="between" style={{ padding: "16px 20px" }}><h2>Gap matrix</h2><span className="tiny muted">Every finding quotes the BRD text it is based on</span></div>
            {gaps.length === 0 ? (
              <div style={{ padding: "0 20px 20px" }}><Empty>No gaps found.</Empty></div>
            ) : (
              <table className="t">
                <thead><tr><th>Gap</th><th>Lens</th><th>BRD ref</th><th>Severity</th><th>Evidence</th><th>Question for the client</th><th>Proposed default</th></tr></thead>
                <tbody>
                  {gaps.map((g) => (
                    <tr key={g.gap_id}>
                      <td><b>{g.gap_id}</b></td>
                      <td className="small">{LENS[g.lens] ?? g.lens}</td>
                      <td className="small">{g.brd_ref}</td>
                      <td><Chip tone={g.severity === "CRITICAL_BLOCKER" ? "block" : g.severity.startsWith("HIGH") ? "warn" : "grey"}>{g.severity === "CRITICAL_BLOCKER" ? "Critical" : g.severity.startsWith("HIGH") ? "High cost" : human(g.severity)}</Chip></td>
                      <td className="small muted">&ldquo;{g.evidence_quote}&rdquo;</td>
                      <td className="small">{g.stakeholder_clarification_question}</td>
                      <td className="small">{g.recommended_default_assumption}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <div className="grid2">
        <section className="card col">
          <h2>Gates</h2>
          <ol className="col" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {gate(
              1,
              "Guardrails and Deep Audit",
              <span className="small muted">
                {!audit ? "Not run yet." : critical > 0 ? `${critical} critical blocker${critical === 1 ? "" : "s"}. Fix them and submit again.` : `No CRITICAL_BLOCKER. BRD-G11 passed.${rules.length ? ` ${rules.length} rule finding${rules.length === 1 ? "" : "s"} to note.` : ""}`}
              </span>,
              !audit ? "grey" : critical ? "block" : "ok",
              !audit ? "Not run" : critical ? "Blocked" : "Passed",
            )}
            {gate(
              2,
              "BA Lead approval",
              doc.status === "IN_REVIEW" && can(user, "brd.approve") ? (
                <form action={decideBrd.bind(null, id, doc.id)} className="col" style={{ gap: 8 }}>
                  <textarea name="note" className="input" placeholder="Comments for the BA (required when requesting changes)" aria-label="Review comments" />
                  <div className="row">
                    <button className="btn primary" name="decision" value="APPROVE">Approve as BA Lead</button>
                    <button className="btn" name="decision" value="CHANGES">Request changes</button>
                  </div>
                </form>
              ) : (
                <span className="small muted">
                  {doc.status === "IN_REVIEW" ? "Waiting for the BA Lead." : doc.status === "CHANGES_REQUESTED" ? `Changes requested${doc.reviewNote ? `: ${doc.reviewNote}` : "."}` : doc.approvedAt ? `Approved ${fmtDate(doc.approvedAt)}.` : "The BA submits the BRD first."}
                </span>
              ),
              doc.approvedAt ? "ok" : doc.status === "IN_REVIEW" ? "warn" : doc.status === "CHANGES_REQUESTED" ? "block" : "grey",
              doc.approvedAt ? "Approved" : doc.status === "IN_REVIEW" ? "Waiting" : doc.status === "CHANGES_REQUESTED" ? "Changes requested" : "Not submitted",
            )}
            {gate(
              3,
              "Client sign-off check (Krama)",
              signoff ? (
                <div className="col" style={{ gap: 6 }}>
                  <span className="small">Signed by {signoff.signedByName} ({signoff.signedByEmail}) on {signoff.signedOn}{signoff.evidenceName ? ` · evidence ${signoff.evidenceName}` : ""}. FSD phase unlocked.</span>
                  {can(user, "signoff.record") && (
                    <details>
                      <summary className="tiny" style={{ cursor: "pointer", color: "#a12a26" }}>Withdraw sign-off</summary>
                      <form action={withdrawSignoff.bind(null, id, doc.id)} className="col" style={{ gap: 6, marginTop: 6 }}>
                        <input name="note" className="input" required minLength={5} placeholder="Why the client withdrew" aria-label="Reason" />
                        <button className="btn sm danger" style={{ alignSelf: "flex-start" }}>Withdraw</button>
                      </form>
                    </details>
                  )}
                </div>
              ) : doc.status === "APPROVED" && can(user, "signoff.record") ? (
                <form action={recordSignoff.bind(null, id, doc.id)} className="col" style={{ gap: 8 }}>
                  <span className="small muted">Record the client&apos;s written approval. Krama checks this before the FSD unlocks; it is not part of the BRD.</span>
                  <div className="grid2" style={{ gap: 8 }}>
                    <input name="signedByName" className="input" required placeholder="Signed by (name)" aria-label="Signed by name" defaultValue={p.clientSignoffOwner?.split(",")[0] ?? ""} />
                    <input name="signedByEmail" type="email" className="input" required placeholder="Email" aria-label="Signed by email" />
                    <input name="signedOn" type="date" className="input" required aria-label="Signed on" />
                    <input name="evidence" type="file" className="small" aria-label="Evidence (email or PDF)" />
                  </div>
                  <input name="note" className="input" placeholder="Note (optional)" aria-label="Note" />
                  <button className="btn primary" style={{ alignSelf: "flex-start" }}>Record client sign-off</button>
                </form>
              ) : (
                <span className="small muted">Krama checks for the client&apos;s sign-off before the FSD unlocks. Owner: {p.clientSignoffOwner ?? "not named"}.</span>
              ),
              signoff ? "ok" : doc.status === "APPROVED" ? "warn" : "grey",
              signoff ? "Received" : "Not received",
            )}
          </ol>
        </section>

        <section className="card col">
          <h2>Top questions before scope is frozen</h2>
          {questions.length === 0 ? (
            <Empty>No blocker questions.</Empty>
          ) : (
            <ol className="col small" style={{ paddingLeft: 18, margin: 0 }}>
              {questions.map((q) => (
                <li key={q.priority_rank}>
                  <b>{q.question}</b> ({q.gap_ids.join(", ")}). <span className="muted">{q.why_it_blocks_estimation}</span>
                  <div className="tiny muted">Suggested SOW clause: {q.suggested_contractual_guardrail}</div>
                </li>
              ))}
            </ol>
          )}
          {rules.length > 0 && (
            <>
              <h3 style={{ marginTop: 8 }}>Krama rule checks</h3>
              <table className="t">
                <thead><tr><th>Rule</th><th>Ref</th><th>Finding</th></tr></thead>
                <tbody>
                  {rules.map((x, n) => (
                    <tr key={n}>
                      <td><Chip tone={x.severity === "CRITICAL_BLOCKER" || x.severity === "HIGH" ? "block" : "warn"}>{x.rule}</Chip></td>
                      <td className="small">{x.ref}</td>
                      <td className="small">{x.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </>
  );
}
