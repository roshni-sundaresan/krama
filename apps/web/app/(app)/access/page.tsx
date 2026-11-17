import { ROLES, ROLE_LABELS, type Role } from "@krama/shared";
import { addUser, updateUser } from "@/app/actions";
import { Chip, Flash, PageHead, type SP } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { can, requireUser } from "@/lib/session";

interface U { id: string; email: string; name: string; roles: Role[]; active: boolean; lastSignInAt: string | null; createdAt: string }
interface Log { id: string; action: string; actorName: string; entityType: string; data: Record<string, unknown>; createdAt: string }

export default async function AccessPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  if (!can(user, "users.manage")) {
    return (
      <>
        <PageHead eyebrow="Admin" title="Access administration" />
        <div className="notice warn">Only the Super Admin manages access. Ask them if you need a role changed.</div>
      </>
    );
  }
  const [users, log] = await Promise.all([api<U[]>("/access/users"), api<Log[]>("/access/log")]);

  return (
    <>
      <PageHead eyebrow="Admin" title="Access administration" />
      <p className="muted" style={{ margin: "-10px 0 0" }}>Only @idealake.com accounts can be given access. Sign-in is through Microsoft; Krama has no passwords. A role change applies on the person&apos;s next click.</p>
      <Flash searchParams={searchParams} />

      <section className="card flush">
        <div style={{ padding: "16px 20px" }}><h2>People and roles ({users.length})</h2></div>
        <table className="t">
          <thead><tr><th>Person</th><th>Roles</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b><div className="tiny muted">{u.email}</div></td>
                <td>
                  <details>
                    <summary style={{ cursor: "pointer" }} className="row">
                      {u.roles.length ? u.roles.map((r) => <Chip key={r} tone="info">{ROLE_LABELS[r]}</Chip>) : <Chip tone="warn">No role (pending)</Chip>}
                    </summary>
                    <form action={updateUser.bind(null, u.id)} className="col" style={{ gap: 6, marginTop: 8 }}>
                      <input type="hidden" name="rolesSent" value="1" />
                      <div className="grid2" style={{ gap: 4 }}>
                        {ROLES.map((r) => (
                          <label key={r} className="row tiny" style={{ gap: 6 }}><input type="checkbox" name="roles" value={r} defaultChecked={u.roles.includes(r)} /> {ROLE_LABELS[r]}</label>
                        ))}
                      </div>
                      <button className="btn sm" style={{ alignSelf: "flex-start" }}>Save roles</button>
                    </form>
                  </details>
                </td>
                <td><Chip tone={u.active ? "ok" : "grey"}>{u.active ? "Active" : "Deactivated"}</Chip></td>
                <td className="small muted">{u.lastSignInAt ? fmtDate(u.lastSignInAt) : "Never"}</td>
                <td>
                  {u.id !== user.id && (
                    <form action={updateUser.bind(null, u.id)}>
                      <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                      <button className={`btn sm ${u.active ? "danger" : ""}`}>{u.active ? "Deactivate" : "Reactivate"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid2">
        <section className="card col">
          <h2>Give access</h2>
          <form action={addUser} className="col" style={{ gap: 10 }}>
            <div className="grid2" style={{ gap: 10 }}>
              <label className="f">Name<input name="name" className="input" required minLength={2} /></label>
              <label className="f">Idealake email<input name="email" type="email" className="input" required placeholder="name@idealake.com" /></label>
            </div>
            <fieldset className="grid2" style={{ gap: 4, border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
              <legend className="small" style={{ fontWeight: 600, padding: "0 4px" }}>Roles</legend>
              {ROLES.map((r) => <label key={r} className="row small" style={{ gap: 6 }}><input type="checkbox" name="roles" value={r} /> {ROLE_LABELS[r]}</label>)}
            </fieldset>
            <button className="btn primary" style={{ alignSelf: "flex-start" }}>Give access</button>
          </form>
        </section>
        <section className="card col">
          <h2>Access log</h2>
          <table className="t">
            <tbody>
              {log.slice(0, 15).map((l) => (
                <tr key={l.id}>
                  <td className="small"><b>{l.actorName || "System"}</b> {l.action.replace(/[._]/g, " ")}</td>
                  <td className="tiny muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
