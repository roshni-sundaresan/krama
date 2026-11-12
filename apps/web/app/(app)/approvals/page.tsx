import Link from "next/link";
import { api } from "@/lib/api";
import { can, requireUser } from "@/lib/session";
import { DecisionForm } from "@/components/decision-form";
import { Badge, Card, Empty, Notice, StatusBadge } from "@/components/ui";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const user = await requireUser();
  const all = await api.approvals.list();
  const pending = all.filter((a) => a.status === "PENDING");
  const decided = all.filter((a) => a.status !== "PENDING").slice(0, 20);
  const mayDecide = (subject: string) => (subject === "EXCEPTION" ? can(user, "LeadArchitect") : can(user, "Approver"));

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <Card title={`Pending (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty>Inbox zero.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((a) => (
              <li key={a.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.subjectType === "EXCEPTION" ? "violet" : "blue"}>{a.subjectType.toLowerCase()}</Badge>
                  <span className="font-medium">{a.summary}</span>
                  <span className="text-xs text-slate-400">requested by {a.requestedBy.name} · {new Date(a.createdAt).toLocaleString()}</span>
                  {a.projectId && a.subjectType !== "EXCEPTION" && (
                    <Link className="text-xs text-brand-700" href={`/projects/${a.projectId}/${a.subjectType === "REQUIREMENTS" ? "requirements" : "documents"}`}>
                      review →
                    </Link>
                  )}
                </div>
                {mayDecide(a.subjectType) ? (
                  <DecisionForm approvalId={a.id} back="/approvals" />
                ) : (
                  <p className="text-xs text-slate-500">
                    Decided by {a.subjectType === "EXCEPTION" ? "a Lead Architect" : "an Approver"}.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Recently decided">
        {decided.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {decided.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {a.summary} {a.comments && <span className="text-xs text-slate-500">— “{a.comments}”</span>}
                </span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
