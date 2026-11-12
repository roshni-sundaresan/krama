import { api } from "@/lib/api";
import { can, requireUser } from "@/lib/session";
import { submitRequirements } from "@/app/actions";
import { DecisionForm } from "@/components/decision-form";
import { Badge, Button, Card, Empty, Notice, StatusBadge } from "@/components/ui";

export default async function RequirementsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const user = await requireUser();
  const [requirements, gaps, sources, runs, approvals] = await Promise.all([
    api.requirements.list(id),
    api.gaps.list(id),
    api.sources.list(id),
    api.runs.list(id),
    api.approvals.list({ projectId: id, status: "PENDING" }),
  ]);
  const sourceTitle = new Map(sources.map((s) => [s.id, s.title]));
  const run = runs[0];
  const waiting = run?.stage === "AWAITING_REQUIREMENTS_APPROVAL";
  const pending = approvals.find((a) => a.subjectType === "REQUIREMENTS");
  const hasDrafts = requirements.some((r) => r.status === "DRAFT");

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      {run && (
        <p className="text-sm text-slate-600">
          Latest run: <StatusBadge status={run.status} /> <Badge>{run.stage.replaceAll("_", " ").toLowerCase()}</Badge>
          {run.status === "RUNNING" && " — refresh in a few seconds."}
        </p>
      )}
      {pending && can(user, "Approver") && (
        <Card title="Approval requested — requirements">
          <DecisionForm approvalId={pending.id} back={`/projects/${id}/requirements`} />
        </Card>
      )}
      <Card
        title={`Requirements (${requirements.length})`}
        actions={
          can(user, "BA") && (
            <form action={submitRequirements.bind(null, id)}>
              <Button disabled={!waiting || !hasDrafts || !!pending}>{pending ? "Awaiting approval" : "Submit for approval"}</Button>
            </form>
          )
        }
      >
        {requirements.length === 0 ? (
          <Empty>No requirements yet. Add inputs and run the Documentation capability.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {requirements.map((r) => (
              <li key={r.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{r.code}</span>
                  <span className="font-medium">{r.title}</span>
                  <Badge tone={r.priority === "MUST" ? "red" : r.priority === "SHOULD" ? "amber" : "slate"}>{r.priority}</Badge>
                  <Badge>{r.type.replace("_", "-").toLowerCase()}</Badge>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-slate-700">{r.description}</p>
                <ul className="space-y-0.5 border-l-2 border-brand-100 pl-3 text-xs text-slate-500">
                  {r.citations.map((c, i) => (
                    <li key={i}>
                      <span className="font-medium text-slate-600">{sourceTitle.get(c.sourceItemId) ?? c.sourceItemId}</span>
                      {c.location && ` · ${c.location}`}: “{c.quote}”
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`Gap report (${gaps.length})`}>
        {gaps.length === 0 ? (
          <Empty>No gaps reported.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {gaps.map((g) => (
              <li key={g.id} className="flex items-start gap-2 py-2">
                <Badge tone={g.severity === "HIGH" ? "red" : g.severity === "MEDIUM" ? "amber" : "slate"}>{g.severity}</Badge>
                <span>
                  <span className="font-medium">{g.category}</span> — {g.description}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
