import Link from "next/link";
import { api } from "@/lib/api";
import { can, requireUser } from "@/lib/session";
import { Badge, Card, Empty, LinkButton, StatusBadge } from "@/components/ui";

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await api.projects.list();
  return (
    <Card title="Projects" actions={can(user, "BA", "LeadArchitect") ? <LinkButton href="/projects/new">New project</LinkButton> : null}>
      {projects.length === 0 ? (
        <Empty>No projects yet.</Empty>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Name</th>
              <th>Type / technology</th>
              <th>Depth</th>
              <th>Phase</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="py-2">
                  <Link href={`/projects/${p.id}/inputs`} className="font-medium text-brand-700 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="text-slate-600">
                  {p.projectType} · {p.technology}
                </td>
                <td>
                  <Badge tone={p.depthMode === "governed" ? "red" : "slate"}>{p.depthMode}</Badge>
                </td>
                <td>
                  <StatusBadge status={p.phase} />
                </td>
                <td>{p.clientWork && <Badge tone="violet">client work</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
