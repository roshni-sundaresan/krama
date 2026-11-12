import { api } from "@/lib/api";
import { can, requireUser } from "@/lib/session";
import { submitDocuments } from "@/app/actions";
import { DecisionForm } from "@/components/decision-form";
import { Badge, Button, Card, Empty, Notice, StatusBadge } from "@/components/ui";

export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const user = await requireUser();
  const [documents, runs, approvals, sources] = await Promise.all([
    api.documents.list(id),
    api.runs.list(id),
    api.approvals.list({ projectId: id, status: "PENDING" }),
    api.sources.list(id),
  ]);
  const sourceTitle = new Map(sources.map((s) => [s.id, s.title]));
  const waiting = runs[0]?.stage === "AWAITING_DOCUMENTS_APPROVAL";
  const pending = approvals.find((a) => a.subjectType === "DOCUMENTS");

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      {pending && can(user, "Approver") && (
        <Card title="Approval requested — BRD / SOW / FSD">
          <DecisionForm approvalId={pending.id} back={`/projects/${id}/documents`} />
        </Card>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Every statement cites its source; statements without a source are marked <Badge tone="amber">AI-suggested</Badge>.
        </p>
        {can(user, "BA") && (
          <form action={submitDocuments.bind(null, id)}>
            <Button disabled={!waiting || !!pending}>{pending ? "Awaiting approval" : "Submit drafts for approval"}</Button>
          </form>
        )}
      </div>
      {documents.length === 0 ? (
        <Card>
          <Empty>No drafts yet. Drafts are generated after the requirements are approved.</Empty>
        </Card>
      ) : (
        documents.map((d) => (
          <Card key={d.id} title={<>{d.content.title} <span className="font-normal text-slate-400">v{d.version}</span></>} actions={<StatusBadge status={d.status} />}>
            <div className="space-y-4">
              {d.content.sections.map((s) => (
                <section key={s.heading}>
                  <h3 className="mb-1 text-sm font-semibold text-slate-700">{s.heading}</h3>
                  <ul className="space-y-1 text-sm">
                    {s.statements.map((st, i) => (
                      <li key={i} className={st.aiSuggested ? "rounded bg-amber-50 px-2 py-1" : "px-2 py-1"}>
                        {st.text}{" "}
                        {st.aiSuggested ? (
                          <Badge tone="amber">AI-suggested</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">
                            [{st.requirementCodes.join(", ")}
                            {st.citations.length > 0 && ` · ${st.citations.map((c) => `${sourceTitle.get(c.sourceItemId) ?? c.sourceItemId}${c.location ? ` ${c.location}` : ""}`).join("; ")}`}]
                          </span>
                        )}
                      </li>
                    ))}
                    {s.statements.length === 0 && <li className="px-2 text-slate-400">—</li>}
                  </ul>
                </section>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
