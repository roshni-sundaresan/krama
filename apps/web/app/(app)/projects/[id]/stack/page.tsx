import { DOMAINS, DOMAIN_LABELS, ENTITY_LABELS, ENTITY_TYPES, VERTICAL_LABELS, type Vertical } from "@krama/shared";
import { addMember, packDecision, regeneratePack, selectStack } from "@/app/actions";
import { DownloadMenu, wordPdf } from "@/components/menu";
import { Chip, Empty, Flash, NotFound, PageHead, one, type SP, type Tone } from "@/components/ui";
import { api, load } from "@/lib/api";
import { fmtDate, fmtDay } from "@/lib/format";
import { can, requireUser } from "@/lib/session";
import type { Adr, Pack, PackRule, Person, Project, StackDef } from "@/lib/types";

const PACK_TONE: Record<string, Tone> = { DRAFT: "grey", SUBMITTED: "warn", APPROVED: "ok", REJECTED: "block", SUPERSEDED: "grey", WITHDRAWN: "grey" };
const PACK_LABEL: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Waiting for approval", APPROVED: "Approved", REJECTED: "Rejected", SUPERSEDED: "Superseded", WITHDRAWN: "Withdrawn" };

function counts(rules: PackRule[]) {
  const n = (l: string) => rules.filter((r) => r.level === l).length;
  return `Non-waivable ${n("NON_WAIVABLE")} · Block ${n("BLOCK")} · Warn ${n("WARN")}`;
}

export default async function StackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const user = await requireUser();
  const p = await load<Project>(`/projects/${id}`);
  if (!p) return <NotFound />;
  const architect = can(user, "stack.select");
  const [stacks, packsRes, brd, people] = await Promise.all([
    api<StackDef[]>("/stacks"),
    api<{ packs: Pack[]; decisions: Adr[] }>(`/projects/${id}/packs`),
    api<{ document: { status: string } | null }>(`/projects/${id}/brd`),
    can(user, "project.assign") ? api<Person[]>("/people") : Promise.resolve([] as Person[]),
  ]);
  const brdApproved = brd.document && ["APPROVED", "CLIENT_SIGNED_OFF"].includes(brd.document.status);
  const sp = await searchParams;
  const pick = one(sp.stack) ?? p.stackKey ?? stacks.find((s) => s.platforms.some((x) => p.platforms.includes(x)))?.key ?? stacks[0]!.key;
  const domain = one(sp.domain) ?? p.domain;
  const entity = one(sp.entityType) ?? p.entityType ?? "";
  const preview = architect && brdApproved
    ? await api<{ rules: PackRule[]; regulations: { id: string; name: string; version: string }[]; checklist: StackDef["checklist"] }>(
        `/projects/${id}/packs/preview?stackKey=${pick}&domain=${domain}${domain !== "GENERAL" && entity ? `&entityType=${entity}` : ""}`,
      ).catch(() => null)
    : null;
  const current = packsRes.packs.find((pk) => pk.status !== "SUPERSEDED") ?? packsRes.packs[0];
  const verticals = current ? ([...new Set(current.content.rules.map((r) => r.vertical))] as Vertical[]) : [];
  const memberIds = new Set(p.members.map((m) => m.userId));
  const assignable = people.filter((u) => !memberIds.has(u.id));
  const stackName = stacks.find((s) => s.key === p.stackKey)?.name;

  return (
    <>
      <PageHead
        eyebrow={`${p.name} · Build · domain ${DOMAIN_LABELS[p.domain]}${p.domainConfirmed ? ", confirmed by Tech Architect" : ", not yet confirmed"} · only Tech Architects can select or change the stack`}
        title="Tech stack and guardrails pack"
      >
        {packsRes.decisions[0] && <Chip tone="info">ADR-P{String(packsRes.decisions[0].number).padStart(2, "0")} recorded</Chip>}
      </PageHead>
      <Flash searchParams={searchParams} />
      {!brdApproved && <div className="notice warn">Tech stack selection starts once the BA Lead approves the BRD.</div>}

      {architect && brdApproved && (
        <section className="card col" style={{ gap: 16 }}>
          <div className="between">
            <h2>{p.stackKey ? `Selected: ${stackName}` : "Choose the stack"}</h2>
            {p.stackKey && <span className="small muted">Changing the stack records a new ADR and a new pack version.</span>}
          </div>
          <form method="get" className="col" style={{ gap: 12 }}>
            <div className="grid3">
              {stacks.map((s) => (
                <label key={s.key} className="stmt" style={{ cursor: "pointer", borderColor: s.key === pick ? "var(--blue)" : undefined, background: s.key === pick ? "#eaf1fb" : undefined }}>
                  <span className="row" style={{ gap: 8 }}>
                    <input type="radio" name="stack" value={s.key} defaultChecked={s.key === pick} />
                    <b>{s.name}</b>
                    {s.key === p.stackKey && <Chip tone="ok">Selected</Chip>}
                  </span>
                  <span className="small muted">{s.summary}</span>
                  <span className="tiny">{Object.values(s.layers).join(" · ")}</span>
                  <span className="tiny muted">Fits: {s.platforms.join(", ")}</span>
                </label>
              ))}
            </div>
            <div className="row">
              <label className="f" style={{ minWidth: 220 }}>
                Domain (confirm)
                <select name="domain" className="input" defaultValue={domain}>{DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}</select>
              </label>
              <label className="f" style={{ minWidth: 280 }}>
                Regulated entity
                <select name="entityType" className="input" defaultValue={entity}>
                  <option value="">Not applicable</option>
                  {ENTITY_TYPES.map((e) => <option key={e} value={e}>{ENTITY_LABELS[e]}</option>)}
                </select>
              </label>
              <button className="btn" style={{ alignSelf: "flex-end" }}>Preview the pack</button>
            </div>
          </form>
          {preview && (
            <div className="notice ok small">
              Preview for {stacks.find((s) => s.key === pick)?.name}, {DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS]}: {preview.rules.length} rules ({counts(preview.rules)}), {preview.regulations.length} regulations, {preview.checklist.length} checklist items.
            </div>
          )}
          <form action={selectStack.bind(null, id)} className="col" style={{ gap: 10 }}>
            <input type="hidden" name="stackKey" value={pick} />
            <input type="hidden" name="domain" value={domain} />
            <input type="hidden" name="entityType" value={entity} />
            <label className="f">
              Decision rationale (goes into the ADR)
              <textarea name="rationale" className="input" required minLength={10} defaultValue={pick === p.stackKey ? (p.stackRationale ?? "") : ""} placeholder="Why this stack fits: integrations, team skills, platforms" />
            </label>
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" required /> I confirm the domain is {DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS]}{entity ? ` (${ENTITY_LABELS[entity as keyof typeof ENTITY_LABELS]})` : ""}.
            </label>
            <button className="btn primary" style={{ alignSelf: "flex-start" }}>Save stack, record ADR and generate pack</button>
          </form>
        </section>
      )}

      {!architect && p.stackKey && (
        <section className="card col">
          <h2>Selected stack</h2>
          <span>{stackName}</span>
          <span className="small muted">{p.stackRationale}</span>
        </section>
      )}

      <section className="card flush">
        <div className="between" style={{ padding: "16px 20px" }}>
          <div className="col" style={{ gap: 2 }}>
            <h2>Guardrails pack{current ? ` v${current.version}` : ""}</h2>
            {current && <span className="tiny muted">{current.content.stack.name} · {DOMAIN_LABELS[current.domain as keyof typeof DOMAIN_LABELS]}{current.entityType ? ` · ${ENTITY_LABELS[current.entityType as keyof typeof ENTITY_LABELS]}` : ""} · {current.content.rules.length} rules · project code {p.code}</span>}
          </div>
          {current && (
            <div className="row">
              <Chip tone={PACK_TONE[current.status]}>{PACK_LABEL[current.status]}</Chip>
              {current.status === "APPROVED" && <DownloadMenu label="Download full pack" items={wordPdf(`/projects/${id}/packs/${current.id}/download?kind=guardrails`)} />}
            </div>
          )}
        </div>
        {!current ? (
          <div style={{ padding: "0 20px 20px" }}><Empty>No pack yet. Krama generates it when the Tech Architect saves the stack.</Empty></div>
        ) : (
          <>
            {current.status !== "APPROVED" && (
              <div className="notice warn" style={{ margin: "0 20px 12px" }}>Downloads open once the Tech Architect approves this pack.</div>
            )}
            <table className="t">
              <thead><tr><th>Document</th><th>Version</th><th>Rules</th><th>Actions</th></tr></thead>
              <tbody>
                {verticals.map((v) => {
                  const rules = current.content.rules.filter((r) => r.vertical === v);
                  return (
                    <tr key={v}>
                      <td><b>{VERTICAL_LABELS[v]} guardrails</b><div className="tiny muted">{[...new Set(rules.map((r) => r.topic))].join(", ")}</div></td>
                      <td>v{current.version}</td>
                      <td className="small">{counts(rules)}</td>
                      <td>{current.status === "APPROVED" ? <DownloadMenu items={wordPdf(`/projects/${id}/packs/${current.id}/download?kind=guardrails&vertical=${v}`)} /> : <span className="tiny muted">After approval</span>}</td>
                    </tr>
                  );
                })}
                {[
                  ["Blueprints", `${current.content.blueprints.length} blueprints: structure, patterns and ways of working`, "blueprints", "docx"],
                  ["Rules pack for AI coding agents", "AGENTS.md to add to the repository", "rules", "md"],
                  ["Required software checklist", `${current.content.checklist.length} tools with approved versions`, "checklist", "docx"],
                  ["Machine-checkable rules", "guardrails.json for CI or the optional project check", "ci", "md"],
                ].map(([t, d, k, f]) => (
                  <tr key={k}>
                    <td><b>{t}</b><div className="tiny muted">{d}</div></td>
                    <td>v{current.version}</td>
                    <td className="small">{k === "ci" ? `${current.content.rules.filter((r) => r.check).length} checks` : "—"}</td>
                    <td>{current.status === "APPROVED" ? <DownloadMenu items={f === "docx" ? wordPdf(`/projects/${id}/packs/${current.id}/download?kind=${k}`) : [{ label: k === "rules" ? "AGENTS.md" : "guardrails.json", hint: k === "rules" ? "Markdown" : "JSON", path: `/projects/${id}/packs/${current.id}/download?kind=${k}&format=${f}` }]} /> : <span className="tiny muted">After approval</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="col" style={{ padding: 20, gap: 10 }}>
              <span className="small"><b>Regulations in this pack:</b> {current.content.regulations.map((r) => `${r.name} (${r.version})`).join("; ") || "None"}</span>
              {current.decisionNote && <span className="small muted">Decision note: {current.decisionNote}</span>}
              {can(user, "pack.approve") && (current.status === "SUBMITTED" || current.status === "DRAFT") && (
                <form action={packDecision.bind(null, id, current.id)} className="row">
                  <input name="note" className="input" placeholder="Note (optional)" aria-label="Decision note" style={{ maxWidth: 360 }} />
                  <button className="btn primary" name="decision" value="APPROVE">Approve pack</button>
                  <button className="btn" name="decision" value="REJECT">Reject</button>
                </form>
              )}
              {can(user, "pack.approve") && current.status === "APPROVED" && (
                <div className="row">
                  <form action={regeneratePack.bind(null, id)}><button className="btn sm">Regenerate from the latest master</button></form>
                  <form action={packDecision.bind(null, id, current.id)}><input type="hidden" name="note" value="Withdrawn by Tech Architect" /><button className="btn sm danger" name="decision" value="WITHDRAW">Withdraw pack</button></form>
                </div>
              )}
              {can(user, "pack.generate") && current.status === "REJECTED" && (
                <form action={regeneratePack.bind(null, id)}><button className="btn sm">Generate a new version</button></form>
              )}
            </div>
          </>
        )}
      </section>

      <div className="grid2">
        <section className="card col">
          <h2>Architecture decisions</h2>
          {packsRes.decisions.length === 0 ? (
            <Empty>No ADR yet.</Empty>
          ) : (
            packsRes.decisions.map((d) => (
              <details key={d.id} className="stmt">
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>ADR-P{String(d.number).padStart(2, "0")} · {d.title} <span className="tiny muted">({fmtDay(d.createdAt)})</span></summary>
                <dl className="kv small" style={{ marginTop: 8 }}>
                  <dt>Context</dt><dd>{d.context}</dd>
                  <dt>Decision</dt><dd>{d.decision}</dd>
                  <dt>Consequences</dt><dd>{d.consequences}</dd>
                </dl>
              </details>
            ))
          )}
        </section>
        <section className="card col">
          <div className="between"><h2>Project team</h2><span className="tiny muted">Developers see only projects they are assigned to</span></div>
          <table className="t">
            <thead><tr><th>Name</th><th>Roles</th><th>Added</th></tr></thead>
            <tbody>
              {p.members.map((m) => (
                <tr key={m.userId}><td>{m.user.name}</td><td className="small">{m.user.roles.join(", ")}</td><td className="small muted">{fmtDate((m as unknown as { createdAt: string }).createdAt)}</td></tr>
              ))}
            </tbody>
          </table>
          {can(user, "project.assign") && assignable.length > 0 && (
            <form action={addMember.bind(null, id, `/projects/${id}/stack`)} className="row">
              <label className="sr-only" htmlFor="userId">Person</label>
              <select id="userId" name="userId" className="input" style={{ maxWidth: 320 }}>
                {assignable.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.roles.join(", ")}</option>)}
              </select>
              <button className="btn">Assign to project</button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
