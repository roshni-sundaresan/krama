import { DOMAIN_LABELS } from "@krama/shared";
import { checkRepo, checkUpload, confirmChecklist, decideException, requestException } from "@/app/actions";
import { Chip, DownloadLink, Empty, Flash, LEVEL_LABEL, NotFound, PageHead, levelTone, type SP, type Tone } from "@/components/ui";
import { load } from "@/lib/api";
import { fmtDate, fmtDay } from "@/lib/format";
import { can, requireUser } from "@/lib/session";
import type { Project } from "@/lib/types";

interface CheckResult { ruleId: string; name: string; status: "pass" | "fail" | "warn" | "skipped" | string; blocking: boolean; nonWaivable: boolean; effectiveLevel: string; findings: { file: string; line?: number; message: string }[]; exceptedFindings: unknown[] }
interface DevView {
  project: Project;
  pack: null | { id: string; version: number; approvedAt: string; stack: { name: string; layers: Record<string, string> }; ruleCount: number; checkable: string[]; rules: { id: string; title: string; level: string; vertical: string }[] };
  checklist: { id: string; name: string; version: string; verify: string; required: boolean }[];
  myConfirmation: null | { items: { id: string; ticked: boolean }[]; confirmedAt: string; packVersion: number };
  team: { id: string; name: string; email: string; ready: boolean; confirmedAt: string | null }[];
  checks: { id: string; source: string; ref: string; status: string; passed: boolean | null; blocking: number; warnings: number; filesScanned: number; error: string | null; createdAt: string; userName: string; report: { results: CheckResult[] } | null }[];
  exceptions: { id: string; ruleId: string; reason: string; compensatingControl: string; status: string; expiresAt: string; requestedByName: string; createdAt: string; decisionNote?: string | null }[];
}
const EX_TONE: Record<string, Tone> = { REQUESTED: "warn", APPROVED: "ok", REJECTED: "block", REVOKED: "grey", EXPIRED: "grey" };

export default async function DevelopmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const user = await requireUser();
  const v = await load<DevView>(`/projects/${id}/development`);
  if (!v) return <NotFound />;
  const { project: p, pack } = v;
  const isDev = can(user, "checklist.confirm");
  const confirmed = Boolean(v.myConfirmation && v.myConfirmation.packVersion === pack?.version);
  const latest = v.checks[0];
  const results = latest?.report?.results.filter((r) => r.status !== "pass") ?? [];
  const waivable = pack?.rules.filter((r) => r.level !== "NON_WAIVABLE") ?? [];
  const steps = ["Confirm software", "Download packs", "Pull", "Generate with your AI agent", "Push", "Optional check in Krama"];

  return (
    <>
      <PageHead eyebrow={`${p.name} · Build · domain ${DOMAIN_LABELS[p.domain]}${pack ? ` · stack ${pack.stack.name}` : ""}`} title="Development">
        {p.existingProduction && <Chip tone="warn">Existing client production project</Chip>}
        <Chip tone="grey">Stack set by Tech Architect · read only</Chip>
      </PageHead>
      <Flash searchParams={searchParams} />
      <div className="notice warn small" style={{ background: "#eaf1fb", color: "#0b4fa8" }}>You work on your own machine. Krama gives you the rules; it does not run on your machine.</div>

      {!pack ? (
        <div className="card"><Empty>Development opens once the Tech Architect approves the guardrails pack.</Empty></div>
      ) : (
        <>
          <ol className="pipe" style={{ gridTemplateColumns: "repeat(6, minmax(0,1fr))", listStyle: "none", padding: 0, margin: 0 }}>
            {steps.map((s, i) => (
              <li key={s} className={`step ${i === 0 ? (confirmed ? "done" : "active") : i === 1 && confirmed ? "active" : ""}`}>
                <span className="s">Step {i + 1}</span><span className="n">{s}</span>
              </li>
            ))}
          </ol>

          <div className="grid2" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)" }}>
            <section className="card col">
              <div className="between">
                <h2>1 · Software checklist for this stack</h2>
                <DownloadLink path={`/projects/${id}/packs/${pack.id}/download?kind=checklist&format=docx`}>Download checklist</DownloadLink>
              </div>
              <form action={confirmChecklist.bind(null, id)} className="col">
                <table className="t">
                  <thead><tr><th>Installed</th><th>Item</th><th>Approved version</th><th>Check with</th></tr></thead>
                  <tbody>
                    {v.checklist.map((c) => (
                      <tr key={c.id}>
                        <td><input type="checkbox" name="ticked" value={c.id} aria-label={c.name} defaultChecked={v.myConfirmation?.items.find((i) => i.id === c.id)?.ticked} disabled={!isDev} /></td>
                        <td>{c.name}{!c.required && <span className="tiny muted"> (optional)</span>}</td>
                        <td className="small">{c.version}</td>
                        <td><code className="tiny">{c.verify}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {isDev && (
                  <div className="between">
                    <span className="tiny muted">Krama records who confirmed and when; it does not scan your machine.</span>
                    <button className="btn primary">{confirmed ? "Confirm again" : "I have these installed"}</button>
                  </div>
                )}
                {confirmed && <span className="small" style={{ color: "#0b6b67" }}>You confirmed on {fmtDate(v.myConfirmation!.confirmedAt)} for pack v{pack.version}.</span>}
              </form>
            </section>

            <section className="card col">
              <div className="between"><h2>2 · Downloads</h2><span className="tiny muted">Pack v{pack.version} · approved {fmtDay(pack.approvedAt)}</span></div>
              {!confirmed && isDev && <div className="notice warn small">Confirm the checklist first; downloads open after that.</div>}
              {[
                ["Rules pack for your AI agent", "AGENTS.md to add to your repository", "rules", "md", "Markdown"],
                ["Guardrails pack", `${pack.ruleCount} rules: security, OWASP, regulation, stack`, "guardrails", "docx", "Word"],
                ["Blueprints", "Structure, patterns and ways of working", "blueprints", "docx", "Word"],
                ["Machine-checkable rules", "guardrails.json for CI", "ci", "md", "JSON"],
              ].map(([t, d, k, f, label]) => (
                <div key={k} className="between stmt" style={{ flexDirection: "row" }}>
                  <div className="col" style={{ gap: 2 }}><b>{t}</b><span className="tiny muted">{d}</span></div>
                  {confirmed || !isDev ? <DownloadLink path={`/projects/${id}/packs/${pack.id}/download?kind=${k}&format=${f}`}>{label}</DownloadLink> : <span className="btn sm" aria-disabled="true">{label}</span>}
                </div>
              ))}
              <p className="tiny muted" style={{ margin: 0 }}>Steps 3 to 5 happen in your own repository and AI coding tool. Never paste client personal data into a prompt.</p>
            </section>
          </div>

          <section className="card col" id="check">
            <div className="between">
              <h2>6 · Optional project check</h2>
              <span className="tiny muted">Reads your code only; never changes or pushes it · {pack.checkable.length} machine checks</span>
            </div>
            {can(user, "check.run") && (
              <div className="row" style={{ alignItems: "flex-end" }}>
                <form action={checkRepo.bind(null, id)} className="row" style={{ gap: 6 }}>
                  <label className="f">Repository (https)<input name="repoUrl" type="url" className="input" placeholder="https://github.com/idealake/…" style={{ width: 320 }} required /></label>
                  <button className="btn">Check repository</button>
                </form>
                <span className="muted small" style={{ paddingBottom: 10 }}>or</span>
                <form action={checkUpload.bind(null, id)} className="row" style={{ gap: 6 }}>
                  <label className="f">Upload a ZIP<input name="file" type="file" accept=".zip" required className="small" /></label>
                  <button className="btn">Run check</button>
                </form>
              </div>
            )}
            {latest ? (
              <>
                <div className="row">
                  <Chip tone={latest.status === "FAILED" ? "block" : latest.passed ? "ok" : "block"}>{latest.status === "FAILED" ? "Check failed" : latest.passed ? "Passed" : `${latest.blocking} blocking`}</Chip>
                  <span className="small muted">{latest.warnings} warning{latest.warnings === 1 ? "" : "s"} · {latest.filesScanned} files · {latest.ref} · {latest.userName} · {fmtDate(latest.createdAt)}</span>
                </div>
                {latest.error && <div className="notice err">{latest.error}</div>}
                {results.length > 0 && (
                  <table className="t">
                    <thead><tr><th>Finding</th><th>Rule</th><th>Where</th><th>Level</th></tr></thead>
                    <tbody>
                      {results.flatMap((r) =>
                        (r.findings.length ? r.findings : [{ file: "—", message: r.name }]).map((f, i) => (
                          <tr key={`${r.ruleId}-${i}`}>
                            <td className="small">{f.message}</td>
                            <td className="small"><b>{r.ruleId}</b> {r.name}</td>
                            <td><code className="tiny">{f.file}{"line" in f && f.line ? `:${f.line}` : ""}</code></td>
                            <td><Chip tone={r.nonWaivable ? "block" : levelTone(r.effectiveLevel)}>{r.nonWaivable ? "Non-waivable" : LEVEL_LABEL[r.effectiveLevel] ?? r.effectiveLevel}</Chip></td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                )}
                {v.checks.length > 1 && <span className="tiny muted">Earlier checks: {v.checks.slice(1).map((c) => `${fmtDay(c.createdAt)} ${c.passed ? "passed" : `${c.blocking} blocking`}`).join(" · ")}</span>}
              </>
            ) : (
              <Empty>No checks yet.</Empty>
            )}
          </section>

          <div className="grid2">
            <section className="card col" id="exceptions">
              <h2>Guardrail exceptions</h2>
              {v.exceptions.length === 0 ? (
                <Empty>No exception requests.</Empty>
              ) : (
                v.exceptions.map((e) => (
                  <div key={e.id} className="stmt" style={{ gap: 6 }}>
                    <div className="between"><b>{e.ruleId}</b><Chip tone={EX_TONE[e.status] ?? "grey"}>{e.status.toLowerCase()}</Chip></div>
                    <span className="small">{e.reason}</span>
                    <span className="tiny muted">Control: {e.compensatingControl} · by {e.requestedByName} · expires {fmtDay(e.expiresAt)}</span>
                    {can(user, "exception.decide") && (e.status === "REQUESTED" || e.status === "APPROVED") && (
                      <form action={decideException.bind(null, id, e.id)} className="row">
                        <input name="note" className="input" placeholder="Note" aria-label="Decision note" style={{ maxWidth: 220 }} />
                        {e.status === "REQUESTED" ? (
                          <>
                            <button className="btn sm primary" name="decision" value="APPROVE">Approve</button>
                            <button className="btn sm" name="decision" value="REJECT">Reject</button>
                          </>
                        ) : (
                          <button className="btn sm danger" name="decision" value="REVOKE">Revoke</button>
                        )}
                      </form>
                    )}
                  </div>
                ))
              )}
              {can(user, "exception.request") && waivable.length > 0 && (
                <details>
                  <summary className="btn sm" style={{ listStyle: "none", display: "inline-flex" }}>Request an exception</summary>
                  <form action={requestException.bind(null, id)} className="col" style={{ gap: 8, marginTop: 10 }}>
                    <select name="ruleId" className="input" aria-label="Rule">{waivable.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.title} ({LEVEL_LABEL[r.level]})</option>)}</select>
                    <textarea name="reason" className="input" required minLength={10} placeholder="Why the rule can't be met now" aria-label="Reason" />
                    <input name="compensatingControl" className="input" required minLength={5} placeholder="Compensating control" aria-label="Compensating control" />
                    <label className="f">Expires in (days)<input name="days" type="number" min={1} max={90} defaultValue={14} className="input" style={{ width: 120 }} /></label>
                    <span className="tiny muted">Non-waivable rules can&apos;t have exceptions.</span>
                    <button className="btn primary" style={{ alignSelf: "flex-start" }}>Send request</button>
                  </form>
                </details>
              )}
            </section>
            <section className="card col">
              <div className="between"><h2>Team confirmation</h2><span className="tiny muted">Each developer confirms; Krama does not scan machines</span></div>
              {v.team.length === 0 ? (
                <Empty>No developers assigned yet. The Tech Architect assigns them on the Tech stack page.</Empty>
              ) : (
                <table className="t">
                  <thead><tr><th>Developer</th><th>Checklist confirmed</th><th>Status</th></tr></thead>
                  <tbody>
                    {v.team.map((t) => (
                      <tr key={t.id}><td>{t.name}</td><td className="small">{t.confirmedAt ? fmtDate(t.confirmedAt) : "Not yet"}</td><td><Chip tone={t.ready ? "ok" : "warn"}>{t.ready ? "Ready" : "Checklist pending"}</Chip></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
