import { api } from "@/lib/api";
import { can, requireUser } from "@/lib/session";
import { importIdhi, startDocumentationRun, uploadSource } from "@/app/actions";
import { Badge, Button, Card, Empty, Notice, StatusBadge, inputClass } from "@/components/ui";

export default async function InputsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const user = await requireUser();
  const isBA = can(user, "BA");
  const [sources, runs, meetings] = await Promise.all([
    api.sources.list(id),
    api.runs.list(id),
    isBA ? api.sources.idhiMeetings() : Promise.resolve([]),
  ]);
  const imported = new Set(sources.map((s) => s.externalRef).filter(Boolean));
  const activeRun = runs.find((r) => r.status === "RUNNING" || r.status === "WAITING");

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <Card
        title={`Sources (${sources.length})`}
        actions={
          isBA && (
            <form action={startDocumentationRun.bind(null, id)}>
              <Button disabled={!!activeRun || sources.length === 0} title={activeRun ? "A run is already in progress" : undefined}>
                Run Documentation capability
              </Button>
            </form>
          )
        }
      >
        {sources.length === 0 ? (
          <Empty>No inputs yet. Upload a BA document or import an iDhi meeting.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{s.title}</span>{" "}
                  <span className="font-mono text-xs text-slate-400">{s.id}</span>
                </span>
                <span className="flex items-center gap-2">
                  {!s.text && <Badge tone="amber">no text extracted (TODO)</Badge>}
                  <Badge tone={s.kind === "IDHI_MEETING" ? "violet" : "slate"}>{s.kind === "IDHI_MEETING" ? "iDhi meeting" : "upload"}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isBA && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Upload BA document">
            <form action={uploadSource.bind(null, id)} className="space-y-3">
              <input type="file" name="file" required className={inputClass} accept=".txt,.md,.csv,.json,.vtt,.pdf,.docx" />
              <p className="text-xs text-slate-500">Text formats are extracted now; PDF/DOCX are stored (extraction TODO).</p>
              <Button>Upload</Button>
            </form>
          </Card>
          <Card title="Import from iDhi">
            {meetings.length === 0 ? (
              <Empty>No meetings available.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {meetings.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {m.title} <span className="text-xs text-slate-400">{m.date.slice(0, 10)}</span>
                    </span>
                    <form action={importIdhi.bind(null, id, m.id)}>
                      <Button variant="secondary" disabled={imported.has(m.id)}>{imported.has(m.id) ? "Imported" : "Import"}</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Card title="Workflow runs">
        {runs.length === 0 ? (
          <Empty>No runs yet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>
                  {r.workflowType} <span className="text-xs text-slate-400">{new Date(r.startedAt).toLocaleString()}</span>
                  {r.error && <span className="block text-xs text-rose-700">{r.error}</span>}
                </span>
                <span className="flex gap-2">
                  <Badge>{r.stage.replaceAll("_", " ").toLowerCase()}</Badge>
                  <StatusBadge status={r.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
