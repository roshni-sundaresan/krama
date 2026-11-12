import Link from "next/link";
import { api } from "@/lib/api";
import { can, requireUser } from "@/lib/session";
import { Card, Empty, LinkButton, StatusBadge } from "@/components/ui";

export default async function HomePage() {
  const user = await requireUser();
  const [projects, pending] = await Promise.all([api.projects.list(), api.approvals.list({ status: "PENDING" })]);
  const mine = pending.filter((a) =>
    a.subjectType === "EXCEPTION" ? can(user, "LeadArchitect") : can(user, "Approver"),
  );

  return (
    <>
      <h1 className="text-xl font-semibold">Welcome, {user.name}</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title={`Approvals waiting (${mine.length})`} actions={<Link className="text-sm text-brand-700" href="/approvals">Open inbox →</Link>}>
          {mine.length === 0 ? (
            <Empty>Nothing waiting for you.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {mine.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{a.summary}</span>
                  <StatusBadge status={a.subjectType} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="My projects" actions={can(user, "BA", "LeadArchitect") ? <LinkButton href="/projects/new">New project</LinkButton> : null}>
          {projects.length === 0 ? (
            <Empty>No projects yet.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {projects.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/projects/${p.id}/inputs`} className="font-medium text-brand-700 hover:underline">
                    {p.name}
                  </Link>
                  <StatusBadge status={p.phase} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
