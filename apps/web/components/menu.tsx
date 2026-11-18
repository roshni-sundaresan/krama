import type { ReactNode } from "react";

/** A small dropdown menu built on <details> (works without JavaScript). */
export function Menu({ label, children, align = "right", className = "btn sm", ariaLabel }: { label: ReactNode; children: ReactNode; align?: "left" | "right"; className?: string; ariaLabel?: string }) {
  return (
    <details className="menu">
      <summary className={className} aria-label={ariaLabel}>
        {label}
      </summary>
      <div className={`menu-list ${align === "left" ? "left" : ""}`} role="menu">{children}</div>
    </details>
  );
}

const href = (path: string) => `/api/download?path=${encodeURIComponent(path)}`;

/** One "Download" button with a menu of formats, instead of a button per format. */
export function DownloadMenu({ items, label = "Download", primary = false }: { items: { label: string; path: string; hint?: string }[]; label?: string; primary?: boolean }) {
  return (
    <Menu label={<>{label} <span className="caret">▾</span></>} className={`btn sm ${primary ? "primary" : ""}`}>
      {items.map((i) => (
        <a key={i.label} className="menu-item" role="menuitem" href={href(i.path)}>
          {i.label}
          {i.hint && <span className="hint">{i.hint}</span>}
        </a>
      ))}
    </Menu>
  );
}

/** Word and PDF entries for a guardrail / blueprint / document download path (format is appended). */
export const wordPdf = (path: string) => {
  const sep = path.includes("?") ? "&" : "?";
  return [
    { label: "Word", hint: ".docx", path: `${path}${sep}format=docx` },
    { label: "PDF", hint: ".pdf", path: `${path}${sep}format=pdf` },
  ];
};

/** Row actions behind one "⋯" button. */
export function ActionsMenu({ children, label = "Actions" }: { children: ReactNode; label?: string }) {
  return (
    <Menu label={<>⋯<span className="sr-only">{label}</span></>} className="btn sm" ariaLabel={label}>
      {children}
    </Menu>
  );
}
