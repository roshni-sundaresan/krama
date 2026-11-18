"use client";

import { useState } from "react";

/** A dropdown with checkboxes; submits one form value per ticked option, like a checkbox group. */
export function MultiSelect({ name, options, defaultValue = [], placeholder = "Choose", id }: { name: string; options: { value: string; label: string }[]; defaultValue?: string[]; placeholder?: string; id?: string }) {
  const [picked, setPicked] = useState<string[]>(defaultValue);
  const toggle = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <details className="ms" id={id}>
      <summary className="input" aria-label={`${placeholder}: ${picked.map(label).join(", ") || "none"}`}>
        <span className="ms-values">
          {picked.length === 0 ? <span className="muted">{placeholder}</span> : picked.map((v) => <span key={v} className="chip info">{label(v)}</span>)}
        </span>
        <span className="tiny muted">▾</span>
      </summary>
      <div className="ms-list">
        {options.map((o) => (
          <label key={o.value}>
            <input type="checkbox" checked={picked.includes(o.value)} onChange={() => toggle(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
      {picked.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </details>
  );
}
