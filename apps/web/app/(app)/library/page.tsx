import Link from "next/link";
import { DOMAINS, DOMAIN_LABELS, VERTICALS, VERTICAL_LABELS, type Vertical } from "@krama/shared";
import { DownloadMenu } from "@/components/menu";
import { Chip, LEVEL_LABEL, PageHead, levelTone, one, type SP } from "@/components/ui";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/session";
import type { PackRule } from "@/lib/types";

interface Library {
  version: string;
  byVertical: { vertical: Vertical; label: string; topics: { topic: string; label: string; count: number }[]; ruleCount: number; version: number; blueprint: { title: string; sections: { heading: string; items: string[] }[] } }[];
  rules: PackRule[];
  regulations: { id: string; name: string; version: string }[];
}

export default async function LibraryPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const vertical = (one(sp.v) as Vertical | undefined) ?? "TECHNOLOGY";
  const domain = one(sp.domain) ?? "";
  const topic = one(sp.topic) ?? "";
  const lib = await api<Library>(`/library?${domain ? `domain=${domain}&` : ""}`);
  const v = lib.byVertical.find((x) => x.vertical === vertical) ?? lib.byVertical[0]!;
  const rules = lib.rules.filter((r) => r.vertical === v.vertical && (!topic || r.topic === topic));
  const q = (o: Record<string, string>) => `/library?${new URLSearchParams({ v: vertical, ...(domain ? { domain } : {}), ...(topic ? { topic } : {}), ...o }).toString()}`;
  const dl = (kind: string, format: string) => `/library/download?kind=${kind}&vertical=${v.vertical}${domain ? `&domain=${domain}` : ""}${topic && kind === "guardrails" ? `&topic=${topic}` : ""}&format=${format}`;

  return (
    <>
      <PageHead eyebrow="Overview · master library" title="Blueprints & guardrails">
        <Chip tone="info">{lib.version}</Chip>
      </PageHead>
      <p className="muted" style={{ margin: "-10px 0 0" }}>The master rules Krama composes each project&apos;s pack from. Project packs are fixed at the version they were approved with. Leads publish new versions in <Link href="/guardrails">Guardrail management</Link>.</p>

      <div className="between">
        <div className="tabs" role="tablist" aria-label="Vertical">
          {VERTICALS.map((x) => (
            <Link key={x} role="tab" aria-selected={x === v.vertical} className={`tab ${x === v.vertical ? "on" : ""}`} href={`/library?${new URLSearchParams({ v: x, ...(domain ? { domain } : {}) })}`}>{VERTICAL_LABELS[x]}</Link>
          ))}
        </div>
        <form className="row" method="get">
          <input type="hidden" name="v" value={v.vertical} />
          <label className="sr-only" htmlFor="domain">Domain</label>
          <select id="domain" name="domain" className="input" defaultValue={domain} style={{ width: 200 }}>
            <option value="">All domains</option>
            {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}
          </select>
          <button className="btn">Filter</button>
        </form>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)" }}>
        <section className="card flush">
          <div className="between" style={{ padding: "16px 20px" }}>
            <h2>{v.label} guardrails v{v.version} ({rules.length})</h2>
            <span className="row" style={{ gap: 6 }}>
              <DownloadMenu items={[{ label: "Word", hint: ".docx", path: dl("guardrails", "docx") }, { label: "PDF", hint: ".pdf", path: dl("guardrails", "pdf") }]} />
            </span>
          </div>
          <div className="row" style={{ padding: "0 20px 12px", gap: 6 }}>
            <Link className={`chip ${!topic ? "info" : "grey"}`} href={q({ topic: "" })} style={{ textDecoration: "none" }}>All topics</Link>
            {v.topics.map((t) => (
              <Link key={t.topic} className={`chip ${topic === t.topic ? "info" : "grey"}`} href={q({ topic: t.topic })} style={{ textDecoration: "none" }}>{t.label} · {t.count}</Link>
            ))}
          </div>
          <table className="t">
            <thead><tr><th>Rule</th><th>Level</th><th>What it requires</th><th>Source</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.id}</b><div className="small">{r.title}</div>{r.check && <div className="tiny muted">Machine-checked</div>}</td>
                  <td><Chip tone={levelTone(r.level)}>{LEVEL_LABEL[r.level]}</Chip></td>
                  <td className="small">{r.text}</td>
                  <td className="tiny muted">{(r.sources ?? []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="col" style={{ gap: 20 }}>
          <section className="card col">
            <div className="between">
              <h2>{v.blueprint.title}</h2>
              <DownloadMenu items={[{ label: "Word", hint: ".docx", path: dl("blueprints", "docx") }, { label: "PDF", hint: ".pdf", path: dl("blueprints", "pdf") }]} />
            </div>
            {v.blueprint.sections.map((s) => (
              <div key={s.heading}>
                <h3>{s.heading}</h3>
                <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{s.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </section>
          <section className="card col">
            <h2>Regulations referenced</h2>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {lib.regulations.map((r) => <li key={r.id}>{r.name} <span className="muted">({r.version})</span></li>)}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
