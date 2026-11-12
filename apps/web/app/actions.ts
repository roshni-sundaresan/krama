"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CreateProjectSchema,
  DecideApprovalSchema,
  DepthModeSchema,
  GuardrailRuleSchema,
  RequestExceptionSchema,
} from "@krama/shared";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { api } from "@/lib/api";

/** Run an API mutation, then redirect back with a success or error notice. */
async function mutate(back: string, ok: string, fn: () => Promise<unknown>): Promise<never> {
  let error: string | undefined;
  try {
    await fn();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  revalidatePath(back.split("?")[0]!);
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}${error ? `error=${encodeURIComponent(error)}` : `ok=${encodeURIComponent(ok)}`}`);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function devSignIn(fd: FormData) {
  await signIn("dev", { email: str(fd, "email"), redirectTo: "/" });
}

export async function entraSignIn() {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}

export async function createProject(fd: FormData) {
  const parsed = CreateProjectSchema.safeParse({
    name: str(fd, "name"),
    description: str(fd, "description") || undefined,
    clientWork: fd.get("clientWork") === "on",
    clientName: str(fd, "clientName") || undefined,
    projectType: str(fd, "projectType"),
    technology: str(fd, "technology"),
    depthMode: str(fd, "depthMode"),
    targetPlatforms: fd.getAll("targetPlatforms").map(String),
  });
  if (!parsed.success) redirect(`/projects/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  const project = await api.projects.create(parsed.data);
  redirect(`/projects/${project.id}/inputs?ok=Project+created`);
}

export async function uploadSource(projectId: string, fd: FormData) {
  const file = fd.get("file");
  return mutate(`/projects/${projectId}/inputs`, "Uploaded", async () => {
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload");
    await api.sources.upload(projectId, file);
  });
}

export async function importIdhi(projectId: string, meetingId: string) {
  return mutate(`/projects/${projectId}/inputs`, "iDhi meeting imported", () => api.sources.importIdhi(projectId, meetingId));
}

export async function startDocumentationRun(projectId: string) {
  return mutate(`/projects/${projectId}/requirements`, "Documentation capability started", () => api.runs.startDocumentation(projectId));
}

export async function submitRequirements(projectId: string) {
  return mutate(`/projects/${projectId}/requirements`, "Submitted for approval", () => api.requirements.submit(projectId));
}

export async function submitDocuments(projectId: string) {
  return mutate(`/projects/${projectId}/documents`, "Submitted for approval", () => api.documents.submit(projectId));
}

export async function decideApproval(approvalId: string, back: string, fd: FormData) {
  return mutate(back, "Decision recorded", async () => {
    const input = DecideApprovalSchema.parse({ decision: str(fd, "decision"), comments: str(fd, "comments") || undefined });
    await api.approvals.decide(approvalId, input);
  });
}

export async function requestException(projectId: string, fd: FormData) {
  return mutate(`/projects/${projectId}/build`, "Exception requested — awaiting Lead Architect", async () => {
    const days = Number(str(fd, "days") || "30");
    const input = RequestExceptionSchema.parse({
      projectId,
      ruleId: str(fd, "ruleId"),
      reason: str(fd, "reason"),
      scope: str(fd, "scope"),
      changeRef: str(fd, "changeRef") || undefined,
      paths: str(fd, "paths") ? str(fd, "paths").split(",").map((s) => s.trim()) : [],
      expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
    });
    await api.exceptions.request(input);
  });
}

export async function publishGuardrails(fd: FormData) {
  return mutate("/guardrails", "New guardrail version published", async () => {
    const rules = z.array(GuardrailRuleSchema).parse(JSON.parse(str(fd, "rules")));
    await api.guardrails.publish(rules, str(fd, "changeNote") || undefined);
  });
}

export async function updateProjectSettings(projectId: string, fd: FormData) {
  return mutate(`/projects/${projectId}/build`, "Project settings saved", () =>
    api.projects.updateSettings(projectId, {
      depthMode: DepthModeSchema.parse(str(fd, "depthMode")),
      approvedTools: fd.getAll("approvedTools").map(String),
    }),
  );
}

/** Returns a CLI token to the client component that displays it once (never put tokens in URLs). */
export async function createCliToken(_prev: { token?: string; error?: string }): Promise<{ token?: string; error?: string }> {
  try {
    return { token: (await api.auth.cliToken()).token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
