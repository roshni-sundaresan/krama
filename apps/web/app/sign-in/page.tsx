import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { devSignIn, entraSignIn } from "@/app/actions";
import { Button, Card, inputClass } from "@/components/ui";

const DEV_USERS = [
  ["ba@idealake.local", "Business Analyst"],
  ["dev@idealake.local", "Developer"],
  ["architect@idealake.local", "Lead Architect"],
  ["approver@idealake.local", "Approver"],
  ["admin@idealake.local", "Admin"],
  ["challenger@idealake.local", "Challenger (read-only)"],
] as const;

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if ((await auth())?.user) redirect("/");
  const { error } = await searchParams;
  const entra = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const dev = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-brand-900">Krama</h1>
        <p className="text-sm text-slate-500">Idealake AI Engineering Platform</p>
      </div>
      {error && <p className="rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-800">Sign-in failed ({error}).</p>}
      <Card title="Sign in">
        <div className="space-y-6">
          {entra ? (
            <form action={entraSignIn}>
              <Button className="w-full justify-center">Sign in with Microsoft (Entra ID)</Button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Entra ID SSO is not configured (set AUTH_MICROSOFT_ENTRA_ID_*).</p>
          )}
          {dev && (
            <form action={devSignIn} className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Dev login (mock) — local only</p>
              <select name="email" className={inputClass} defaultValue="ba@idealake.local">
                {DEV_USERS.map(([email, role]) => (
                  <option key={email} value={email}>
                    {role} — {email}
                  </option>
                ))}
              </select>
              <Button variant="secondary" className="w-full justify-center">Continue</Button>
            </form>
          )}
        </div>
      </Card>
    </main>
  );
}
