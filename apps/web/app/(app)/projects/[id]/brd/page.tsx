import Link from "next/link";
import { BRD_SECTIONS, LENS_LABELS, runBrdRuleChecks, type RuleFinding } from "@krama/shared";
import { confirmAllRequirements, findingAction, startDraft, statementAction, submitBrd, updateRequirement } from "@/app/actions";
import { AutoRefresh } from "@/components/nav";
import { DownloadMenu, wordPdf } from "@/components/menu";
import { Chip, Empty, Flash, NotFound, PageHead, one, type SP, type Tone } from "@/components/ui";
import { load } from "@/lib/api";
import { fmtDate, human } from "@/lib/format";
import { can, requireUser } from "@/lib/session";
import type { Finding, Requirement, Workspace } from "@/lib/types";

const REQ_SECTION: Record<string, Requirement["type"]> = { "Functional requirements": "FUNCTIONAL", "Non-functional requirements": "NON_FUNCTIONAL", Constraints: "CONSTRAINT" };
const STATUS: Record<string, [string, Tone]> = {
  DRAFTING: ["Drafting", "info"], DRAFT: ["Draft", "grey"], IN_REVIEW: ["With BA Lead", "info"], CHANGES_REQUESTED: ["Changes requested", "warn"],
  APPROVED: ["Approved", "ok"], CLIENT_SIGNED_OFF: ["Client signed off", "ok"], SUPERSEDED: ["Superseded", "grey"],
};
const sevTone = (s: string): Tone => (s === "CRITICAL_BLOCKER" || s === "HIGH" ? "block" : s === "MEDIUM" ? "warn" : "grey");

export default async function BrdPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const user = await requireUser();
  const ws = await load<Workspace>(`/projects/${id}/brd`);
  if (!ws) return <NotFound />;
  const { project: p, document: doc, requirements, findings, sources, run } = ws;
  const editor = can(user, "brd.draft");

  if (!doc || doc.status === "DRAFTING") {
    const drafting = doc?.status === "DRAFTING" || run?.status === "RUNNING";
    return (
      <>
        <PageHead eyebrow={`${p.name} · Requirements`} title="BRD" />
        <Flash searchParams={searchParams} />
        <section className="card col" style={{ maxWidth: 760 }}>
          {drafting ? (
            <>
              <AutoRefresh />
              <h2>Krama is drafting the BRD</h2>
              <p className="muted" style={{ margin: 0 }}>Reading the masked intake pack, extracting requirements with their sources, checking the six lenses and writing the 20 sections. This page updates by itself.</p>
              <Chip tone="info">Stage: {human(run?.stage ?? "STARTED")}</Chip>
            </>
          ) : run?.status === "FAILED" ? (
            <>
              <h2>Drafting did not finish</h2>
              <div className="notice err">{run.error ?? "The AI step failed."} Nothing was lost; try again.</div>
              {editor && <form action={startDraft.bind(null, id)}><button className="btn primary">Try again</button></form>}
            </>
          ) : (
            <>
              <h2>No BRD yet</h2>
              <p className="muted" style={{ margin: 0 }}>Clear the intake readiness check, then start drafting from the Intake pack.</p>
              <Link className="btn" href={`/projects/${id}/intake`} style={{ alignSelf: "flex-start" }}>Open intake pack</Link>
            </>
          )}
        </section>
      </>
    );
  }

  const content = doc.content;
  const sp = await searchParams;
  const si = Math.min(Math.max(Number(one(sp.s) ?? (content.sections.findIndex((s) => s.heading === "Functional requirements") + 1 || 1)) - 1, 0), content.sections.length - 1);
  const section = content.sections[si]!;
  const back = `/projects/${id}/brd?s=${si + 1}`;
  const editable = editor && (doc.status === "DRAFT" || doc.status === "CHANGES_REQUESTED");

  const checks: RuleFinding[] = runBrdRuleChecks({ requirements, findings: findings.map((f) => ({ ...f })), document: content });
  const blockN = checks.filter((c) => c.severity === "CRITICAL_BLOCKER" || c.severity === "HIGH").length;
  const warnN = checks.filter((c) => c.severity === "MEDIUM").length;
  const openQ = findings.filter((f) => f.status === "OPEN");
  const byCode = new Map(requirements.map((r) => [r.code, r]));
  const srcName = new Map(sources.map((s) => [s.id, s.title]));

  const codesIn = (i: number) => {
    const sec = content.sections[i]!;
    const t = REQ_SECTION[sec.heading];
    const codes = new Set(sec.statements.flatMap((s) => s.requirementCodes));
    if (t) requirements.filter((r) => r.type === t).forEach((r) => codes.add(r.code));
    return codes;
  };
  const sectionTone = (i: number): string => {
    const sec = content.sections[i]!;
    const codes = codesIn(i);
    const cs = checks.filter((c) => codes.has(c.ref) || c.ref === `Section ${i + 1}`);
    if (sec.statements.some((s) => s.aiSuggested && !s.confirmed) || cs.some((c) => sevTone(c.severity) === "block")) return "#d64545";
    if (cs.length || findings.some((f) => f.status === "OPEN" && f.relatedRequirementCodes.some((c) => codes.has(c)))) return "#f5a524";
    return "#1fa39c";
  };
  const codes = codesIn(si);
  const reqType = REQ_SECTION[section.heading];
  const reqs = reqType ? requirements.filter((r) => r.type === reqType) : [];
  const sectionFindings = findings.filter((f) => f.relatedRequirementCodes.some((c) => codes.has(c)));
  const lensList = sectionFindings.length ? sectionFindings : findings;

  return (
    <>
      <PageHead
        eyebrow={`${p.name} · Requirements`}
        title={
          <span className="row" style={{ gap: 10 }}>
            BRD v{doc.version} <Chip tone={STATUS[doc.status]![1]}>{STATUS[doc.status]![0]}</Chip>
            <Chip tone={blockN ? "block" : "ok"}>Block {blockN}</Chip>
            <Chip tone={warnN ? "warn" : "ok"}>Warn {warnN}</Chip>
            <Chip tone={openQ.length ? "info" : "ok"}>Open questions {openQ.length}</Chip>
          </span>
        }
      >
        <DownloadMenu label="Export" items={[...wordPdf(`/documents/${doc.id}/export`), { label: "Markdown", hint: ".md", path: `/documents/${doc.id}/export?format=md` }]} />
        {editable && can(user, "brd.submit") && (
          <form action={submitBrd.bind(null, id, doc.id)}>
            <button className="btn primary">Run Deep Audit & submit</button>
          </form>
        )}
        {!editable && <Link href={`/projects/${id}/audit`} className="btn primary">Deep Audit & approval</Link>}
      </PageHead>
      <Flash searchParams={searchParams} />
      {doc.status === "CHANGES_REQUESTED" && doc.reviewNote && <div className="notice warn"><b>BA Lead comments:</b> {doc.reviewNote}</div>}
      {doc.unconfirmed > 0 && editable && <div className="notice warn">{doc.unconfirmed} AI-drafted statement{doc.unconfirmed === 1 ? "" : "s"} still need a BA to confirm, edit or remove {doc.unconfirmed === 1 ? "it" : "them"} before submission (BA-G10).</div>}

      <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr) 320px", gap: 20, alignItems: "start" }} className="brdgrid">
        <nav className="card" aria-label="BRD sections" style={{ padding: 12, position: "sticky", top: 12 }}>
          <div className="tiny muted" style={{ fontWeight: 600, padding: "0 8px 8px", letterSpacing: ".06em" }}>{content.sections.length} SECTIONS</div>
          {content.sections.map((s, i) => (
            <Link key={i} href={`/projects/${id}/brd?s=${i + 1}`} className={`sec-item ${i === si ? "on" : ""}`} aria-current={i === si ? "true" : undefined}>
              <span>{i + 1}. {s.heading}</span>
              <span className="dot" style={{ background: sectionTone(i) }} aria-hidden="true" />
            </Link>
          ))}
          <p className="tiny muted" style={{ margin: "10px 8px 0" }}>Green complete · amber warnings · red blocking</p>
          {content.sections.length < BRD_SECTIONS.length && <p className="tiny" style={{ color: "#a12a26", margin: "6px 8px 0" }}>Sections missing (BRD-G02)</p>}
        </nav>

        <section className="col" style={{ gap: 16 }}>
          {reqType && (
            <div className="card col">
              <div className="between">
                <h2>{si + 1}. {section.heading} ({reqs.length})</h2>
                {editable && reqs.some((r) => !r.confirmed) && (
                  <form action={confirmAllRequirements.bind(null, id, doc.id, back)}><button className="btn sm">Confirm all requirements</button></form>
                )}
              </div>
              {reqs.length === 0 && <Empty>No requirements of this type were found in the intake pack.</Empty>}
              {reqs.map((r) => (
                <ReqCard key={r.id} r={r} checks={checks.filter((c) => c.ref === r.code)} editable={editable} action={updateRequirement.bind(null, id, r.id, `${back}#${r.code}`)} srcName={srcName} />
              ))}
            </div>
          )}
          <div className="card col">
            <div className="between">
              {reqType ? <h3>Section text in the BRD ({section.statements.length} statements)</h3> : <h2>{si + 1}. {section.heading}</h2>}
              {editable && section.statements.some((s) => s.aiSuggested && !s.confirmed) && (
                <form action={statementAction.bind(null, id, doc.id, back)}>
                  <input type="hidden" name="section" value={si} /><input type="hidden" name="op" value="confirmSection" />
                  <button className="btn sm">Confirm all in this section</button>
                </form>
              )}
            </div>
            <SectionBody collapse={Boolean(reqType)} pending={section.statements.some((s) => s.aiSuggested && !s.confirmed)}>
            {section.statements.length === 0 && <Empty>No content in this section yet.</Empty>}
            {section.statements.map((st, k) => (
              <div key={k} className={`stmt ${st.aiSuggested && !st.confirmed ? "ai" : ""}`}>
                <div className="row" style={{ gap: 6 }}>
                  {st.aiSuggested && !st.confirmed ? <Chip tone="warn">AI-drafted</Chip> : <Chip tone="ok">Confirmed</Chip>}
                  {st.requirementCodes.map((c) => <Chip key={c} tone="info">{c}</Chip>)}
                </div>
                <span>{st.text}</span>
                {st.citations.length > 0 && (
                  <span className="tiny muted">Source: {st.citations.map((c) => `${srcName.get(c.sourceItemId) ?? "source"}${c.location ? ` at ${c.location}` : ""}`).join("; ")}</span>
                )}
                {editable && (
                  <details>
                    <summary className="tiny" style={{ cursor: "pointer", color: "var(--blue)" }}>Confirm, edit or remove</summary>
                    <div className="row" style={{ marginTop: 8, alignItems: "flex-start" }}>
                      <form action={statementAction.bind(null, id, doc.id, back)} className="col" style={{ flex: 1, gap: 6 }}>
                        <input type="hidden" name="section" value={si} /><input type="hidden" name="statement" value={k} /><input type="hidden" name="op" value="edit" />
                        <textarea name="text" className="input" defaultValue={st.text} />
                        <div className="row">
                          <button className="btn sm">Save edit</button>
                        </div>
                      </form>
                      <div className="col" style={{ gap: 6 }}>
                        {st.aiSuggested && !st.confirmed && (
                          <form action={statementAction.bind(null, id, doc.id, back)}>
                            <input type="hidden" name="section" value={si} /><input type="hidden" name="statement" value={k} /><input type="hidden" name="op" value="confirm" />
                            <button className="btn sm primary">Confirm</button>
                          </form>
                        )}
                        <form action={statementAction.bind(null, id, doc.id, back)}>
                          <input type="hidden" name="section" value={si} /><input type="hidden" name="statement" value={k} /><input type="hidden" name="op" value="remove" />
                          <button className="btn sm danger">Remove</button>
                        </form>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            ))}
            </SectionBody>
          </div>

        </section>

        <aside className="card col" style={{ position: "sticky", top: 12 }}>
          <div className="between"><h2>Lens findings</h2><span className="tiny muted">{sectionFindings.length ? "This section" : "Whole BRD"}</span></div>
          <p className="tiny muted" style={{ margin: 0 }}>Each gap becomes a question for the client with a proposed default.</p>
          {lensList.length === 0 && <Empty>No lens findings.</Empty>}
          {lensList.map((f) => <FindingCard key={f.id} f={f} editable={editable} action={findingAction.bind(null, id, f.id, back)} />)}
          {byCode.size > 0 && checks.length > 0 && (
            <details>
              <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>Guardrail checks ({checks.length})</summary>
              <ul className="small" style={{ paddingLeft: 18, margin: "8px 0 0" }}>
                {checks.map((c, n) => <li key={n}><b>{c.rule}</b> {c.ref}: {c.message}</li>)}
              </ul>
            </details>
          )}
          <p className="tiny muted" style={{ margin: 0 }}>Drafted {fmtDate(doc.generation?.generatedAt ?? doc.createdAt)} from {sources.length} masked source{sources.length === 1 ? "" : "s"}.</p>
        </aside>
      </div>
    </>
  );
}

function ReqCard({ r, checks, editable, action, srcName }: { r: Requirement; checks: RuleFinding[]; editable: boolean; action: (fd: FormData) => Promise<void>; srcName: Map<string, string> }) {
  const rows = [...r.acceptanceCriteria, { given: "", when: "", then: "" }];
  return (
    <div id={r.code} className={`stmt ${r.confirmed ? "" : "ai"}`}>
      <div className="between">
        <span style={{ fontWeight: 600 }}>{r.code} · {r.title}</span>
        <span className="row" style={{ gap: 6 }}>
          <Chip tone="grey">{human(r.priority)}</Chip>
          {r.confirmed ? <Chip tone="ok">BA-confirmed</Chip> : <Chip tone="warn">AI-drafted</Chip>}
        </span>
      </div>
      <span>{r.description}</span>
      {r.acceptanceCriteria.map((a, i) => (
        <div key={i} className="code" style={{ whiteSpace: "normal" }}>
          <b>{r.code}-AC{i + 1}</b><br />Given {a.given}<br />When {a.when}<br />Then {a.then}
        </div>
      ))}
      {checks.length > 0 && (
        <div className="small" style={{ color: checks.some((c) => sevTone(c.severity) === "block") ? "#a12a26" : "#7a4f00" }}>
          {checks.map((c) => `${c.rule} ${c.severity === "MEDIUM" ? "Warn" : "Block"}: ${c.message}`).join(" ")}
        </div>
      )}
      <span className="tiny muted">Source: {r.citations.map((c) => `${srcName.get(c.sourceItemId) ?? "source"}${c.location ? ` at ${c.location}` : ""}`).join("; ") || "none (BA-G01)"}</span>
      {editable && (
        <details>
          <summary className="tiny" style={{ cursor: "pointer", color: "var(--blue)" }}>Edit or confirm</summary>
          <form action={action} className="col" style={{ gap: 8, marginTop: 8 }}>
            <label className="f">Description<textarea name="description" className="input" defaultValue={r.description} /></label>
            <span className="small" style={{ fontWeight: 600 }}>Acceptance criteria (Given / When / Then)</span>
            {rows.map((a, i) => (
              <div key={i} className="grid3" style={{ gap: 6 }}>
                <input name="given" className="input" placeholder="Given" defaultValue={a.given} aria-label={`Criterion ${i + 1} given`} />
                <input name="when" className="input" placeholder="When" defaultValue={a.when} aria-label={`Criterion ${i + 1} when`} />
                <input name="then" className="input" placeholder="Then" defaultValue={a.then} aria-label={`Criterion ${i + 1} then`} />
              </div>
            ))}
            <div className="row">
              <button className="btn sm" name="intent" value="save">Save</button>
              <button className="btn sm primary" name="intent" value="confirm">Save and confirm</button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}

function FindingCard({ f, editable, action }: { f: Finding; editable: boolean; action: (fd: FormData) => Promise<void> }) {
  return (
    <div className="stmt" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <Chip tone="info">{f.lens} {LENS_LABELS[f.lens]}</Chip>
        {f.relatedRequirementCodes.slice(0, 2).map((c) => <Chip key={c}>{c}</Chip>)}
        {f.blocking && <Chip tone="block">Blocking</Chip>}
      </div>
      <span style={{ fontWeight: 600 }}>{f.question}</span>
      <span className="small muted">Proposed default: {f.proposedDefault}</span>
      <span className="tiny muted">{f.code} · {f.status === "OPEN" ? "Open" : f.status === "ANSWERED" ? `Answered: ${f.answer}` : "Default accepted"}</span>
      {editable &&
        (f.status === "OPEN" ? (
          <form action={action} className="col" style={{ gap: 6 }}>
            <input name="answer" className="input" placeholder="Client's answer" aria-label={`Answer to ${f.code}`} />
            <div className="row">
              <button className="btn sm" name="op" value="answer">Save answer</button>
              <button className="btn sm" name="op" value="acceptDefault">Accept default</button>
            </div>
          </form>
        ) : (
          <form action={action}><button className="btn sm" name="op" value="reopen">Reopen</button></form>
        ))}
    </div>
  );
}

function SectionBody({ collapse, pending, children }: { collapse: boolean; pending: boolean; children: React.ReactNode }) {
  if (!collapse) return <>{children}</>;
  return (
    <details>
      <summary className="small" style={{ cursor: "pointer", color: "var(--blue)" }}>Show the section text{pending ? " (some statements need confirming)" : ""}</summary>
      <div className="col" style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}
