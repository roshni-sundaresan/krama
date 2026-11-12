import { createProject } from "@/app/actions";
import { Button, Card, Field, Notice, inputClass } from "@/components/ui";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <Card title="New project" className="max-w-2xl">
      <form action={createProject} className="space-y-4">
        <Notice error={error} />
        <Field label="Name">
          <input name="name" required minLength={2} className={inputClass} />
        </Field>
        <Field label="Description">
          <textarea name="description" rows={3} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Project type">
            <select name="projectType" className={inputClass} defaultValue="web-app">
              <option value="web-app">Web app</option>
              <option value="api-service">API service</option>
              <option value="mobile-app">Mobile app</option>
              <option value="data-pipeline">Data pipeline</option>
            </select>
          </Field>
          <Field label="Technology">
            <select name="technology" className={inputClass} defaultValue="typescript-node">
              <option value="typescript-node">TypeScript / Node</option>
              <option value="python">Python</option>
              <option value="java-spring">Java / Spring</option>
              <option value="dotnet">.NET</option>
            </select>
          </Field>
          <Field label="Depth mode" hint="Governed turns guardrail warnings into blocks">
            <select name="depthMode" className={inputClass} defaultValue="guided">
              <option value="skeleton">Skeleton</option>
              <option value="guided">Guided</option>
              <option value="governed">Governed</option>
            </select>
          </Field>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Target platforms</legend>
          <div className="flex gap-4 text-sm">
            {["web", "android", "ios", "api"].map((p) => (
              <label key={p} className="flex items-center gap-1">
                <input type="checkbox" name="targetPlatforms" value={p} defaultChecked={p === "web"} /> {p}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="clientWork" /> Client work
          </label>
          <Field label="Client name">
            <input name="clientName" className={inputClass} />
          </Field>
        </div>
        <Button type="submit">Create project</Button>
      </form>
    </Card>
  );
}
