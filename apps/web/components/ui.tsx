import Link from "next/link";
import type { ReactNode } from "react";

export type SP = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Success or error notice carried back from a server action in the query string. */
export async function Flash({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ok = one(sp.ok), error = one(sp.error);
  if (error) return <div role="alert" className="notice err">{error}</div>;
  if (ok) return <div role="status" className="notice ok">{ok}</div>;
  return null;
}

export function PageHead({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="between">
      <div className="col" style={{ gap: 4 }}>
        {eyebrow && <span className="small muted">{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export type Tone = "ok" | "warn" | "block" | "info" | "grey";
export const Chip = ({ tone = "grey", children }: { tone?: Tone; children: ReactNode }) => <span className={`chip ${tone}`}>{children}</span>;

export function levelTone(level: string): Tone {
  return level === "NON_WAIVABLE" || level === "BLOCK" || level === "HIGH" || level === "CRITICAL_BLOCKER" ? "block" : level === "WARN" || level === "MEDIUM" ? "warn" : "grey";
}
export const LEVEL_LABEL: Record<string, string> = { NON_WAIVABLE: "Non-waivable", BLOCK: "Block", WARN: "Warn" };

export interface PipeStep { phase: string; label: string; state: "done" | "active" | "waiting" | "locked" | "later"; status: string }

export function Pipeline({ steps, projectId }: { steps: PipeStep[]; projectId: string }) {
  const href: Record<string, string> = { INTAKE: "intake", BRD: "brd", CLIENT_SIGNOFF: "audit", STACK: "stack", DEVELOPMENT: "development" };
  return (
    <div className="pipe">
      {steps.map((s) => {
        const cls = `step ${s.state === "locked" ? "" : s.state}`;
        const inner = (
          <>
            <span className="s">{s.status}</span>
            <span className="n">{s.label}</span>
          </>
        );
        return href[s.phase] && s.state !== "later" ? (
          <Link key={s.phase} className={cls} href={`/projects/${projectId}/${href[s.phase]}`}>{inner}</Link>
        ) : (
          <div key={s.phase} className={cls}>{inner}</div>
        );
      })}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted small" style={{ margin: 0 }}>{children}</p>;
}

/** A link through the web app's download proxy (the API token never reaches the browser). */
export function DownloadLink({ path, children, className = "btn sm" }: { path: string; children: ReactNode; className?: string }) {
  return (
    <a className={className} href={`/api/download?path=${encodeURIComponent(path)}`}>
      {children}
    </a>
  );
}

export function NotFound({ what = "project" }: { what?: string }) {
  return (
    <div className="card col">
      <h2>Not found</h2>
      <p className="muted small" style={{ margin: 0 }}>This {what} does not exist, or you are not assigned to it. Ask a Tech Architect if you need access.</p>
      <Link className="btn sm" href="/projects" style={{ alignSelf: "flex-start" }}>Back to projects</Link>
    </div>
  );
}
