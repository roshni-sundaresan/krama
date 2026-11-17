import { ROLE_LABELS } from "@krama/shared";
import { Nav } from "@/components/nav";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const projects = user.roles.length ? await api<{ id: string; code: string; name: string; clientName: string }[]>("/projects") : [];
  const roleLabel = user.roles.length ? user.roles.map((r) => ROLE_LABELS[r]).join(", ") : "No role yet";
  return (
    <div className="shell">
      <Nav user={{ name: user.name, roleLabel }} projects={projects.map(({ id, code, name, clientName }) => ({ id, code, name, clientName }))} />
      <main className="main" id="main">
        {user.roles.length === 0 ? (
          <div className="card col">
            <h1>Your access is pending</h1>
            <p className="muted" style={{ margin: 0 }}>You have signed in, but no role has been given yet. The Super Admin has been notified.</p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
