"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CreateProjectSchema, type AcceptanceCriterion } from "@krama/shared";
import { signIn, signOut } from "@/auth";
import { patch, post } from "@/lib/api";

/** Run an API mutation, then go back with a success or error notice. */
async function mutate(back: string, ok: string, fn: () => Promise<unknown>): Promise<never> {
  let error: string | undefined;
  try {
    await fn();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const [path, hash] = back.split("#");
  revalidatePath(path!.split("?")[0]!);
  const sep = path!.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${error ? `error=${encodeURIComponent(error)}` : `ok=${encodeURIComponent(ok)}`}${hash ? `#${hash}` : ""}`);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

// ---------- auth ----------
export async function devSignIn(fd: FormData) {
  await signIn("dev", { email: str(fd, "email"), redirectTo: "/projects" });
}
export async function entraSignIn() {
  await signIn("microsoft-entra-id", { redirectTo: "/projects" });
}
export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}

// ---------- projects and intake ----------
function intakeFromForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    code: str(fd, "code").toUpperCase(),
    clientName: str(fd, "clientName"),
    description: str(fd, "description") || undefined,
    domain: str(fd, "domain"),
    entityType: str(fd, "entityType") || null,
    platforms: fd.getAll("platforms").map(String),
    government: bool(fd, "government"),
    existingProduction: bool(fd, "existingProduction"),
    accessibilityRequired: bool(fd, "accessibilityRequired"),
    sowReference: str(fd, "sowReference") || undefined,
    clientSignoffOwner: str(fd, "clientSignoffOwner"),
    regulations: str(fd, "regulations") || undefined,
    integrations: str(fd, "integrations") || undefined,
  };
}

export async function createProject(fd: FormData) {
  const parsed = CreateProjectSchema.safeParse(intakeFromForm(fd));
  if (!parsed.success) redirect(`/projects/new?error=${encodeURIComponent(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))}`);
  let id = "";
  try {
    id = (await post<{ id: string }>("/projects", parsed.data)).id;
  } catch (e) {
    redirect(`/projects/new?error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  redirect(`/projects/${id}/intake?ok=Project+created`);
}

export async function updateIntake(projectId: string, fd: FormData) {
  const { code: _c, ...data } = intakeFromForm(fd);
  await mutate(`/projects/${projectId}/intake`, "Intake form saved", () => patch(`/projects/${projectId}/intake`, data));
}

export async function uploadSource(projectId: string, fd: FormData) {
  const file = fd.get("file");
  await mutate(`/projects/${projectId}/intake`, "File uploaded and scanned", async () => {
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload");
    const body = new FormData();
    body.set("file", file, file.name);
    await post(`/projects/${projectId}/sources/upload`, body);
  });
}

export async function importIdhi(projectId: string, fd: FormData) {
  await mutate(`/projects/${projectId}/intake`, "Meeting imported from iDhi", () => post(`/projects/${projectId}/sources/idhi-import`, { meetingId: str(fd, "meetingId") }));
}

export async function tagSource(projectId: string, sourceId: string, fd: FormData) {
  await mutate(`/projects/${projectId}/intake`, "Document tagged", () =>
    post(`/projects/${projectId}/sources/${sourceId}/tag`, {
      docType: str(fd, "docType"), version: str(fd, "version"), docDate: str(fd, "docDate"), provider: str(fd, "provider"), personalData: bool(fd, "personalData"),
    }),
  );
}

export async function confirmMasking(projectId: string, sourceId: string) {
  await mutate(`/projects/${projectId}/intake`, "Masking confirmed", () => post(`/projects/${projectId}/sources/${sourceId}/confirm-masking`));
}

// ---------- BRD ----------
export async function startDraft(projectId: string) {
  await mutate(`/projects/${projectId}/brd`, "Krama is drafting the BRD from the masked intake pack", () => post(`/projects/${projectId}/brd/draft`));
}

export async function updateRequirement(projectId: string, requirementId: string, back: string, fd: FormData) {
  const gwt: AcceptanceCriterion[] = [];
  const given = fd.getAll("given").map(String), when = fd.getAll("when").map(String), then = fd.getAll("then").map(String);
  given.forEach((g, i) => {
    if (g.trim() || when[i]?.trim() || then[i]?.trim()) gwt.push({ given: g.trim(), when: (when[i] ?? "").trim(), then: (then[i] ?? "").trim() });
  });
  const confirmed = str(fd, "intent") === "confirm" ? true : undefined;
  await mutate(back, confirmed ? "Requirement confirmed" : "Requirement saved", () =>
    patch(`/requirements/${requirementId}`, { description: str(fd, "description") || undefined, acceptanceCriteria: gwt, confirmed }),
  );
}

export async function confirmAllRequirements(projectId: string, documentId: string, back: string) {
  await mutate(back, "All requirements confirmed", () => post(`/documents/${documentId}/requirements/confirm-all`));
}

export async function statementAction(projectId: string, documentId: string, back: string, fd: FormData) {
  const stmt = str(fd, "statement");
  await mutate(back, "Saved", () =>
    post(`/documents/${documentId}/statements`, { section: Number(str(fd, "section")), statement: stmt === "" ? undefined : Number(stmt), action: str(fd, "op"), text: str(fd, "text") || undefined }),
  );
}

export async function findingAction(projectId: string, findingId: string, back: string, fd: FormData) {
  await mutate(back, "Question updated", () => post(`/findings/${findingId}`, { action: str(fd, "op"), answer: str(fd, "answer") || undefined }));
}

export async function submitBrd(projectId: string, documentId: string) {
  let error: string | undefined;
  let result: { submitted: boolean; message?: string } | undefined;
  try {
    result = await post<{ submitted: boolean; message?: string }>(`/documents/${documentId}/submit`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  revalidatePath(`/projects/${projectId}/brd`);
  if (error) redirect(`/projects/${projectId}/brd?error=${encodeURIComponent(error)}`);
  if (!result!.submitted) redirect(`/projects/${projectId}/audit?error=${encodeURIComponent(result!.message ?? "Submission blocked")}`);
  redirect(`/projects/${projectId}/audit?ok=${encodeURIComponent("Deep Audit passed the gate. BRD submitted to the BA Lead")}`);
}

export async function runAudit(projectId: string, documentId: string) {
  await mutate(`/projects/${projectId}/audit`, "Deep Audit finished", () => post(`/documents/${documentId}/audit`));
}

export async function decideBrd(projectId: string, documentId: string, fd: FormData) {
  const decision = str(fd, "decision");
  await mutate(`/projects/${projectId}/audit`, decision === "APPROVE" ? "BRD approved" : "Changes requested", () =>
    post(`/documents/${documentId}/decision`, { decision, note: str(fd, "note") || undefined }),
  );
}

export async function recordSignoff(projectId: string, documentId: string, fd: FormData) {
  await mutate(`/projects/${projectId}/audit`, "Client sign-off recorded; the FSD phase is unlocked", async () => {
    const body = new FormData();
    for (const k of ["signedByName", "signedByEmail", "signedOn", "note"]) if (str(fd, k)) body.set(k, str(fd, k));
    const ev = fd.get("evidence");
    if (ev instanceof File && ev.size > 0) body.set("evidence", ev, ev.name);
    await post(`/documents/${documentId}/signoff`, body);
  });
}

export async function withdrawSignoff(projectId: string, documentId: string, fd: FormData) {
  await mutate(`/projects/${projectId}/audit`, "Sign-off withdrawn; the next phase is locked again", () => post(`/documents/${documentId}/signoff/withdraw`, { note: str(fd, "note") }));
}

// ---------- stack and packs ----------
export async function selectStack(projectId: string, fd: FormData) {
  const domain = str(fd, "domain");
  await mutate(`/projects/${projectId}/stack`, "Stack saved, ADR recorded and guardrails pack generated for approval", () =>
    post(`/projects/${projectId}/stack`, { stackKey: str(fd, "stackKey"), domain, entityType: domain === "GENERAL" ? null : str(fd, "entityType") || null, rationale: str(fd, "rationale") }),
  );
}

export async function regeneratePack(projectId: string) {
  await mutate(`/projects/${projectId}/stack`, "Pack regenerated", () => post(`/projects/${projectId}/packs/regenerate`));
}

export async function packDecision(projectId: string, packId: string, fd: FormData) {
  const d = str(fd, "decision");
  await mutate(`/projects/${projectId}/stack`, d === "APPROVE" ? "Pack approved; downloads are open" : d === "REJECT" ? "Pack rejected" : "Pack withdrawn", () =>
    post(`/packs/${packId}/decision`, { decision: d, note: str(fd, "note") || undefined }),
  );
}

export async function addMember(projectId: string, back: string, fd: FormData) {
  await mutate(back, "Assigned to the project", () => post(`/projects/${projectId}/members`, { userId: str(fd, "userId") }));
}

// ---------- development ----------
export async function confirmChecklist(projectId: string, fd: FormData) {
  await mutate(`/projects/${projectId}/development`, "Checklist confirmed", () => post(`/projects/${projectId}/checklist`, { ticked: fd.getAll("ticked").map(String) }));
}

export async function checkUpload(projectId: string, fd: FormData) {
  const file = fd.get("file");
  await mutate(`/projects/${projectId}/development#check`, "Project check finished", async () => {
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a ZIP of your project");
    const body = new FormData();
    body.set("file", file, file.name);
    await post(`/projects/${projectId}/checks/upload`, body);
  });
}

export async function checkRepo(projectId: string, fd: FormData) {
  await mutate(`/projects/${projectId}/development#check`, "Project check finished", () => post(`/projects/${projectId}/checks/repo`, { repoUrl: str(fd, "repoUrl") }));
}

export async function requestException(projectId: string, fd: FormData) {
  const days = Number(str(fd, "days") || "14");
  await mutate(`/projects/${projectId}/development#exceptions`, "Exception requested", () =>
    post(`/exceptions`, { projectId, ruleId: str(fd, "ruleId"), reason: str(fd, "reason"), compensatingControl: str(fd, "compensatingControl"), expiresAt: new Date(Date.now() + days * 86400000).toISOString() }),
  );
}

export async function decideException(projectId: string, id: string, fd: FormData) {
  await mutate(`/projects/${projectId}/development#exceptions`, "Exception updated", () => post(`/exceptions/${id}/decision`, { decision: str(fd, "decision"), note: str(fd, "note") || undefined }));
}

// ---------- access ----------
export async function addUser(fd: FormData) {
  await mutate(`/access`, "Access granted", () => post(`/access/users`, { email: str(fd, "email"), name: str(fd, "name"), roles: fd.getAll("roles").map(String) }));
}

export async function updateUser(id: string, fd: FormData) {
  const active = str(fd, "active");
  await mutate(`/access`, "Access updated", () =>
    patch(`/access/users/${id}`, { roles: fd.has("rolesSent") ? fd.getAll("roles").map(String) : undefined, active: active ? active === "true" : undefined }),
  );
}

// ---------- guardrail management ----------
export async function createGuardrailDraft(vertical: string) {
  let id = "";
  try {
    id = (await post<{ id: string }>(`/guardrails/${vertical}/drafts`)).id;
  } catch (e) {
    redirect(`/guardrails?error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  redirect(`/guardrails/${id}?ok=${encodeURIComponent("New draft started from the live rules")}`);
}

/** Rule rows are posted as r<i>_<field>; rows with no title are ignored (empty "add a rule" rows). */
function rulesFromForm(fd: FormData) {
  const n = Number(fd.get("n") ?? 0);
  const rules = [];
  for (let i = 0; i < n; i++) {
    const title = str(fd, `r${i}_title`);
    if (!title) continue;
    rules.push({
      id: str(fd, `r${i}_id`) || undefined,
      topic: str(fd, `r${i}_topic`),
      title,
      text: str(fd, `r${i}_text`),
      level: str(fd, `r${i}_level`),
      sources: str(fd, `r${i}_sources`).split(",").map((s) => s.trim()).filter(Boolean),
      retired: bool(fd, `r${i}_retired`) || undefined,
    });
  }
  return rules;
}

export async function saveGuardrailDraft(id: string, fd: FormData) {
  await mutate(`/guardrails/${id}`, "Draft saved", () => patch(`/guardrails/versions/${id}`, { changeNote: str(fd, "changeNote"), rules: rulesFromForm(fd) }));
}

export async function uploadGuardrailDocument(id: string, fd: FormData) {
  const file = fd.get("file");
  await mutate(`/guardrails/${id}`, "Document uploaded and scanned", async () => {
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a Word (.docx) or PDF file");
    const body = new FormData();
    body.set("file", file, file.name);
    await post(`/guardrails/versions/${id}/document`, body);
  });
}

export async function publishGuardrails(id: string, fd: FormData) {
  await mutate(`/guardrails/${id}`, "Published. New and regenerated packs now use this version.", () => post(`/guardrails/versions/${id}/publish`, { changeNote: str(fd, "changeNote") }));
}

export async function discardGuardrailDraft(id: string) {
  let error: string | undefined;
  try {
    await post(`/guardrails/versions/${id}/discard`);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  revalidatePath("/guardrails");
  redirect(error ? `/guardrails/${id}?error=${encodeURIComponent(error)}` : "/guardrails?ok=Draft+discarded");
}
