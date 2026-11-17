import Link from "next/link";
import { DOMAIN_LABELS, type Domain } from "@krama/shared";
import { Chip, Empty, Flash, PageHead, Pipeline, type PipeStep, type SP } from "@/components/ui";
import { api } from "@/lib/api";
import { can, requireUser } from "@/lib/session";

interface Row { id: string; code: string; name: string; clientName: string; domain: Domain; platforms: string[]; pipeline: PipeStep[]; phaseLabel: string; gate: string; ba: string | null }
interface Inbox { items: { role: string; title: string; projectCode: string; href: string }[]; summary: { active: number; waiting: number; gates: number; openQuestions: number } }

export default async function ProjectsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const q = String((await searchParams).q ?? "").toLowerCase();
  const [all, inbox] = await Promise.all([api<Row[]>("/projects"), api<Inbox>("/inbox")]);
  const rows = q ? all.filter((p) => `${p.name} ${p.code} ${p.clientName}`.toLowerCase().includes(q)) : all;
  const focus = all.find((p) => p.pipeline.some((s) => s.state === "waiting")) ?? all[0];
  const waiting = focus?.pipeline.find((s) => s.state === "waiting");

  return (
    <>
      <PageHead title="Projects">
        <form className="row" role="search">
          <label className="sr-only" htmlFor="q">Search projects</label>
          <input id="q" name="q" className="input" placeholder="Search" defaultValue={q} style={{ width: 220 }} />
        </form>
        {can(user, "project.create") && <Link href="/projects/new" className="btn primary">New project</Link>}
      </PageHead>
      <p className="muted" style={{ margin: "-10px 0 0" }}>Every project moves through the same gated phases, from intake to release.</p>
      <Flash searchParams={searchParams} />

      <section className="grid4" aria-label="Summary">
        {[
          ["Active projects", inbox.summary.active],
          ["Waiting for your approval", inbox.summary.waiting],
          ["Gates blocked", inbox.summary.gates],
          ["Open client questions", inbox.summary.openQuestions],
        ].map(([l, v]) => (
          <div key={l} className="card stat">
            <span className="small muted">{l}</span>
            <b>{v}</b>
          </div>
        ))}
      </section>

      {focus && (
        <section className="card col" style={{ gap: 14 }}>
          <div className="between">
            <h2>{focus.name}: phase pipeline</h2>
            {waiting ? <Chip tone="warn">Waiting: {waiting.label.toLowerCase()} · {waiting.status}</Chip> : <Chip tone="info">{focus.phaseLabel} · {focus.gate}</Chip>}
          </div>
          <Pipeline steps={focus.pipeline} projectId={focus.id} />
          <p className="small muted" style={{ margin: 0 }}>
            Tech stack selection starts once the BRD is approved and runs alongside the FSD. Each locked phase opens when Krama&apos;s gate check passes. FSD, UI/UX, API and Testing arrive in the next release.
          </p>
        </section>
      )}

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)" }}>
        <section className="card flush">
          <div style={{ padding: "16px 20px" }}><h2>All projects</h2></div>
          {rows.length === 0 ? (
            <div style={{ padding: "0 20px 20px" }}><Empty>{q ? "No project matches your search." : "No projects yet. A BA creates the first one with New project."}</Empty></div>
          ) : (
            <table className="t">
              <thead>
                <tr><th>Project</th><th>Client</th><th>Domain · platforms</th><th>Current phase</th><th>Gate</th><th>BA</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/projects/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link><div className="tiny muted">{p.code}</div></td>
                    <td>{p.clientName}</td>
                    <td className="small">{DOMAIN_LABELS[p.domain]} · {p.platforms.join(", ")}</td>
                    <td>{p.phaseLabel}</td>
                    <td><Chip tone={/block|reject|change/i.test(p.gate) ? "block" : /wait|pending|missing/i.test(p.gate) ? "warn" : /approved|signed|done/i.test(p.gate) ? "ok" : "info"}>{p.gate}</Chip></td>
                    <td className="small">{p.ba ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card col">
          <h2>Waiting on you</h2>
          {inbox.items.length === 0 ? (
            <Empty>Nothing needs your action right now.</Empty>
          ) : (
            inbox.items.map((i, n) => (
              <Link key={n} href={i.href} className="col" style={{ gap: 2, textDecoration: "none", color: "inherit", borderTop: n ? "1px solid var(--line-2)" : undefined, paddingTop: n ? 10 : 0 }}>
                <span className="tiny muted">{i.role}</span>
                <span style={{ fontWeight: 600 }}>{i.title}</span>
                <span className="tiny muted">{i.projectCode}</span>
              </Link>
            ))
          )}
        </section>
      </div>
    </>
  );
}
