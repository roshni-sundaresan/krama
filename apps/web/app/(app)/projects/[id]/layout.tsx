import Link from "next/link";
import { PROJECT_PHASES } from "@krama/shared";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui";

const TABS = [
  ["inputs", "Inputs"],
  ["requirements", "Requirements"],
  ["documents", "Documents"],
  ["build", "Build"],
] as const;

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await api.projects.get(id);
  const phaseIndex = PROJECT_PHASES.indexOf(project.phase);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <p className="text-sm text-slate-500">
            {project.projectType} · {project.technology} · depth <strong>{project.depthMode}</strong>
            {project.clientWork && <> · client: {project.clientName ?? "yes"}</>}
          </p>
        </div>
        <ol className="flex items-center gap-1 text-xs">
          {PROJECT_PHASES.map((p, i) => (
            <li key={p} className="flex items-center gap-1">
              <Badge tone={i < phaseIndex ? "green" : i === phaseIndex ? "blue" : "slate"}>
                {i + 1}. {p.toLowerCase()}
              </Badge>
              {i < PROJECT_PHASES.length - 1 && <span className="text-slate-300">→</span>}
            </li>
          ))}
        </ol>
      </div>
      <nav className="flex gap-1 border-b border-slate-200 text-sm">
        {TABS.map(([slug, label]) => (
          <Link key={slug} href={`/projects/${id}/${slug}`} className="rounded-t-md px-3 py-2 text-slate-600 hover:bg-white hover:text-brand-700">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
