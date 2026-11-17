import { createProject } from "@/app/actions";
import { IntakeForm } from "@/components/intake-form";
import { Flash, PageHead, type SP } from "@/components/ui";
import { can, requireUser } from "@/lib/session";

export default async function NewProject({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  return (
    <>
      <PageHead eyebrow="Requirements" title="New project" />
      <Flash searchParams={searchParams} />
      {can(user, "project.create") ? (
        <section className="card" style={{ maxWidth: 900 }}>
          <IntakeForm action={createProject} submit="Create project" values={{ platforms: ["Web"] }} />
        </section>
      ) : (
        <div className="notice warn">Only a BA or BA Lead can create a project.</div>
      )}
    </>
  );
}
