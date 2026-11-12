import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { requireUser } from "@/lib/session";

const NAV = [
  ["/", "Home"],
  ["/projects", "Projects"],
  ["/approvals", "Approvals"],
  ["/guardrails", "Guardrails"],
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold text-brand-900">
              Krama
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="hover:text-brand-700">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {user.name} <span className="text-xs text-slate-400">({user.roles.join(", ") || "no roles"})</span>
            </span>
            <form action={signOutAction}>
              <button className="text-slate-500 hover:text-slate-800">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
