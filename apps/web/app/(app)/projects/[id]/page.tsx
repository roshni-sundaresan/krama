import { redirect } from "next/navigation";
import { NotFound } from "@/components/ui";
import { load } from "@/lib/api";

const PAGE: Record<string, string> = { INTAKE: "intake", BRD: "brd", CLIENT_SIGNOFF: "audit", STACK: "stack", DEVELOPMENT: "development" };

export default async function ProjectHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await load<{ currentPhase: string }>(`/projects/${id}`);
  if (!p) return <NotFound />;
  redirect(`/projects/${id}/${PAGE[p.currentPhase] ?? "intake"}`);
}
