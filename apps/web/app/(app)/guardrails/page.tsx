import { api } from "@/lib/api";
import { can, requireUser } from "@/lib/session";
import { publishGuardrails } from "@/app/actions";
import { Badge, Button, Card, Field, Notice, StatusBadge, inputClass } from "@/components/ui";

export default async function GuardrailsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const user = await requireUser();
  const editor = can(user, "LeadArchitect");
  const [active, versions, exceptions] = await Promise.all([api.guardrails.active(), api.guardrails.versions(), api.exceptions.list()]);

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <Card
        title={<>Team guardrails — {active.name} <span className="font-normal text-slate-400">v{active.version}</span></>}
        actions={!editor && <Badge>read-only</Badge>}
      >
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Rule</th>
              <th>Type</th>
              <th>Level</th>
              <th>Applies to</th>
              <th>Params</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {active.rules.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="py-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="font-mono text-xs text-slate-400">{r.id}</div>
                </td>
                <td className="text-slate-600">{r.type}</td>
                <td className="space-x-1">
                  <Badge tone={r.level === "BLOCK" ? "red" : "amber"}>{r.level}</Badge>
                  {r.nonWaivable && <Badge tone="violet">non-waivable</Badge>}
                </td>
                <td className="text-xs text-slate-500">{r.appliesTo.length ? r.appliesTo.join(", ") : "all files"}</td>
                <td className="max-w-64 truncate font-mono text-xs text-slate-500">{JSON.stringify(r.params)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">
          Governed projects treat WARN as BLOCK. Developers cannot override rules; request an exception from a project&apos;s Build tab.
        </p>
      </Card>

      {editor && (
        <Card title="Publish a new version (Lead Architect)">
          <form action={publishGuardrails} className="space-y-3">
            <Field label="Rules (JSON)" hint="Platform-mandated rules (secrets, AI providers, audit) must stay BLOCK + non-waivable.">
              <textarea name="rules" rows={16} defaultValue={JSON.stringify(active.rules, null, 2)} className={`${inputClass} font-mono text-xs`} />
            </Field>
            <Field label="Change note">
              <input name="changeNote" className={inputClass} placeholder="Why this change?" />
            </Field>
            <Button>Publish v{active.version + 1}</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Versions">
          <ul className="divide-y divide-slate-100 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2">
                <span>
                  v{v.version} <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleString()} {v.changeNote && `— ${v.changeNote}`}</span>
                </span>
                {v.isActive && <Badge tone="green">active</Badge>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Exception requests">
          <ul className="divide-y divide-slate-100 text-sm">
            {exceptions.length === 0 && <li className="py-2 text-slate-500">None.</li>}
            {exceptions.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-mono text-xs">{e.ruleKey}</span> — {e.reason}
                  <span className="block text-xs text-slate-400">
                    {e.scope.toLowerCase()} · expires {e.expiresAt.slice(0, 10)} · {e.requestedBy.name}
                  </span>
                </span>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
