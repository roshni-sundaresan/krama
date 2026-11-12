"use client";

import { useActionState } from "react";
import { createCliToken } from "@/app/actions";

export function CliTokenButton({ server }: { server: string }) {
  const [state, action, pending] = useActionState(createCliToken, {});
  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate CLI token"}
      </button>
      {state.error && <p className="text-sm text-rose-700">{state.error}</p>}
      {state.token && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Shown once. Valid for 7 days. Run:</p>
          <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
            krama login --server {server} --token {state.token}
          </pre>
        </div>
      )}
    </form>
  );
}
