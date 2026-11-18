"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOutAction } from "@/app/actions";

interface Item { key: string; label: string; role?: string; href?: string; later?: boolean }

export function Nav({ user, projects }: { user: { name: string; roleLabel: string }; projects: { id: string; code: string; name: string; clientName: string }[] }) {
  const path = usePathname();
  // Close open dropdowns (menus, multi-selects) on an outside click or Escape.
  useEffect(() => {
    const close = (e: Event) => {
      document.querySelectorAll<HTMLDetailsElement>("details.menu[open], details.ms[open]").forEach((d) => {
        if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
      });
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, []);
  const m = path.match(/^\/projects\/([^/]+)\/?([^/]*)/);
  const projectId = m && m[1] !== "new" ? m[1] : null;
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const p = (s: string) => (projectId ? `/projects/${projectId}/${s}` : undefined);

  const groups: { label: string; items: Item[] }[] = [
    { label: "Overview", items: [{ key: "projects", label: "Projects", href: "/projects" }, { key: "library", label: "Blueprints & guardrails", href: "/library" }] },
    {
      label: "Requirements",
      items: [
        { key: "intake", label: "Intake pack", role: "BA", href: p("intake") },
        { key: "brd", label: "BRD", role: "BA", href: p("brd") },
        { key: "audit", label: "Deep Audit & approval", role: "BA Lead", href: p("audit") },
      ],
    },
    {
      label: "Specification",
      items: [
        { key: "fsd", label: "FSD", role: "Next release", later: true },
        { key: "design", label: "UI/UX", role: "Next release", later: true },
        { key: "api", label: "API", role: "Next release", later: true },
      ],
    },
    {
      label: "Build",
      items: [
        { key: "stack", label: "Tech stack & guardrails", role: "Tech Architect", href: p("stack") },
        { key: "development", label: "Development", role: "Developer", href: p("development") },
      ],
    },
    {
      label: "Quality",
      items: [
        { key: "testgen", label: "Test case generator", role: "Next release", later: true },
        { key: "testing", label: "Testing tracker", role: "Next release", later: true },
      ],
    },
    { label: "Admin", items: [{ key: "access", label: "Access administration", role: "Super Admin", href: "/access" }] },
  ];

  const active = (it: Item) =>
    it.key === "projects" ? path === "/projects" || path === "/projects/new" : it.href ? path === it.href || path.startsWith(`${it.href}/`) : false;

  return (
    <nav aria-label="Krama" className="side">
      <Link href="/projects" className="row" style={{ gap: 10, padding: "0 8px", color: "#fff" }}>
        <span style={{ width: 34, height: 34, borderRadius: 8, background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>K</span>
        <span className="col" style={{ gap: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Krama</span>
          <span style={{ fontSize: 11, color: "#b8c6e0" }}>Idealake AI Engineering Framework</span>
        </span>
      </Link>
      <div style={{ background: "var(--navy-2)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 11, color: "#b8c6e0" }}>Project</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{project ? project.name : "No project open"}</span>
        <span style={{ fontSize: 11, color: "#b8c6e0" }}>{project ? `${project.code} · ${project.clientName}` : "Open a project to see its phases"}</span>
      </div>
      {groups.map((g) => (
        <div key={g.label} className="col" style={{ gap: 2 }}>
          <span className="navgroup">{g.label}</span>
          {g.items.map((it) =>
            it.href && !it.later ? (
              <Link key={it.key} href={it.href} className={`navlink ${active(it) ? "on" : ""}`} aria-current={active(it) ? "page" : undefined}>
                <span>{it.label}</span>
                {it.role && <span className="r">{it.role}</span>}
              </Link>
            ) : (
              <span key={it.key} className="navlink off" aria-disabled="true" title={it.later ? "Coming in the next release" : "Open a project first"}>
                <span>{it.label}</span>
                {it.role && <span className="r">{it.role}</span>}
              </span>
            ),
          )}
        </div>
      ))}
      <div style={{ marginTop: "auto", borderTop: "1px solid #2a4373", padding: "14px 10px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "#9fb0cf" }}>Signed in with Microsoft SSO</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{user.name} · {user.roleLabel}</span>
        <form action={signOutAction}>
          <button className="btn sm" style={{ marginTop: 6, background: "transparent", color: "#dce6f7", borderColor: "#2a4373" }}>Sign out</button>
        </form>
      </div>
    </nav>
  );
}

/** Refreshes server data every few seconds while a background job runs. */
export function AutoRefresh({ every = 2000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
