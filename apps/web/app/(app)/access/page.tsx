import { ROLES, ROLE_LABELS, type Role } from "@krama/shared";
import { addUser, updateUser } from "@/app/actions";
import Link from "next/link";
import { ActionsMenu } from "@/components/menu";
import { MultiSelect } from "@/components/multi-select";
import { Chip, Flash, PageHead, one, type SP } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { can, requireUser } from "@/lib/session";

interface U { id: string; email: string; name: string; roles: Role[]; active: boolean; lastSignInAt: string | null; createdAt: string }
interface Log { id: string; action: string; actorName: string; entityType: string; data: Record<string, unknown>; createdAt: string }

export default async function AccessPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const edit = one((await searchParams).edit);
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
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
                  {edit === u.id ? (
                    <form action={updateUser.bind(null, u.id)} className="row" style={{ gap: 6, alignItems: "flex-start", flexWrap: "nowrap" }}>
                      <input type="hidden" name="rolesSent" value="1" />
                      <div style={{ minWidth: 260 }}><MultiSelect name="roles" placeholder="No role (pending)" options={roleOptions} defaultValue={u.roles} /></div>
                      <button className="btn sm primary">Save</button>
                      <Link className="btn sm" href="/access">Cancel</Link>
                    </form>
                  ) : (
                    <span className="row" style={{ gap: 6 }}>{u.roles.length ? u.roles.map((r) => <Chip key={r} tone="info">{ROLE_LABELS[r]}</Chip>) : <Chip tone="warn">No role (pending)</Chip>}</span>
                  )}
                </td>
                <td><Chip tone={u.active ? "ok" : "grey"}>{u.active ? "Active" : "Deactivated"}</Chip></td>
                <td className="small muted">{u.lastSignInAt ? fmtDate(u.lastSignInAt) : "Never"}</td>
                <td style={{ textAlign: "right" }}>
                  <ActionsMenu label={`Actions for ${u.name}`}>
                    <Link className="menu-item" role="menuitem" href={`/access?edit=${u.id}`}>Edit roles</Link>
                    {u.id !== user.id && (
                      <>
                        <div className="menu-sep" />
                        <form action={updateUser.bind(null, u.id)}>
                          <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                          <button className={`menu-item ${u.active ? "danger" : ""}`} role="menuitem">{u.active ? "Deactivate access" : "Reactivate access"}</button>
                        </form>
                      </>
                    )}
                  </ActionsMenu>
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
            <div className="f">
              <span>Roles</span>
              <MultiSelect name="roles" placeholder="Choose one or more roles" options={roleOptions} />
            </div>
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
