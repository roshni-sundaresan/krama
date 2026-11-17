import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { devSignIn, entraSignIn } from "@/app/actions";

const API_URL = process.env.KRAMA_API_URL ?? "http://localhost:4000";

async function devUsers(): Promise<{ email: string; name: string; roles: string[] }[]> {
  try {
    const res = await fetch(`${API_URL}/api/auth/dev-users`, { cache: "no-store" });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if ((await auth())?.user) redirect("/projects");
  const { error } = await searchParams;
  const entra = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const dev = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";
  const users = dev ? await devUsers() : [];

  return (
    <main style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }} className="signin">
      <section style={{ background: "var(--navy)", color: "#fff", padding: "48px 56px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 20 }}>
        <div className="row" style={{ gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: 10, background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22 }}>K</span>
          <span className="col" style={{ gap: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 24 }}>Krama</span>
            <span style={{ fontSize: 13, color: "#b8c6e0" }}>Idealake AI Engineering Framework</span>
          </span>
        </div>
        <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Engineering, The Intelligent Way.</p>
        <p style={{ color: "#dce6f7", margin: 0, maxWidth: 460 }}>Requirements, specifications, guardrails and testing for every Idealake project, in one governed flow.</p>
      </section>
      <section style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div className="card col" style={{ width: "100%", maxWidth: 420, gap: 16, padding: 28 }}>
          <h1 style={{ fontSize: 22 }}>Sign in</h1>
          <p className="muted small" style={{ margin: 0 }}>Use your Idealake Microsoft account. Krama does not have its own passwords.</p>
          {error && (
            <div role="alert" className="notice err">
              {error === "AccessDenied" ? "Access is limited to Idealake accounts. Sign in with your @idealake.com account." : "Sign-in did not complete. Try again, or contact IT if it keeps failing."}
            </div>
          )}
          <form action={entraSignIn}>
            <button className="btn primary" style={{ width: "100%" }} disabled={!entra} aria-disabled={!entra}>
              Sign in with Microsoft
            </button>
          </form>
          {!entra && <p className="tiny muted" style={{ margin: 0 }}>Microsoft sign-in is not set up on this machine (AUTH_MICROSOFT_ENTRA_ID_* in .env).</p>}
          <p className="tiny muted" style={{ margin: 0 }}>Only @idealake.com accounts can sign in. Your role decides what you can see and change.</p>
          {dev && (
            <form action={devSignIn} className="col" style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
              <span className="chip warn" style={{ alignSelf: "flex-start" }}>Local development only</span>
              <label className="f">
                Sign in as a sample user
                <select name="email" className="input" defaultValue={users.find((u) => u.roles.includes("BA"))?.email}>
                  {users.map((u) => (
                    <option key={u.email} value={u.email}>{u.name} · {u.roles.join(", ")}</option>
                  ))}
                </select>
              </label>
              <button className="btn">Continue</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
