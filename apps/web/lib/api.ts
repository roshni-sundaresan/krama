import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getToken } from "next-auth/jwt";
import type {
  ApprovalDto,
  CapabilityDto,
  Citation,
  ContextPack,
  CreateProjectInput,
  DecideApprovalInput,
  DocumentContent,
  DocumentType,
  GuardrailExceptionsFile,
  GuardrailRule,
  GuardrailRuleSetFile,
  DepthMode,
  ProjectDto,
  RequestExceptionInput,
} from "@krama/shared";

const API_URL = process.env.KRAMA_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Read the Krama API token from the encrypted Auth.js session cookie (server-side only). */
async function apiToken(): Promise<string> {
  const h = await headers();
  const secureCookie = (process.env.AUTH_URL ?? "").startsWith("https://");
  const jwt = await getToken({ req: { headers: h }, secret: process.env.AUTH_SECRET, secureCookie });
  if (!jwt?.apiToken) redirect("/sign-in");
  return jwt.apiToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await apiToken();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (res.status === 401) redirect("/sign-in");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join("; ") : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const json = (body: unknown) => JSON.stringify(body);

// ---------- Response types (API shapes) ----------
export type Project = ProjectDto & { approvedTools: string[] };
export interface SourceItem {
  id: string;
  kind: "UPLOAD" | "IDHI_MEETING";
  title: string;
  mimeType: string | null;
  externalRef: string | null;
  sizeBytes: number | null;
  createdAt: string;
  text: string | null;
}
export interface IdhiMeetingSummary {
  id: string;
  title: string;
  date: string;
  participants: string[];
}
export type ArtefactStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "RETURNED" | "REJECTED" | "SUPERSEDED";
export interface Requirement {
  id: string;
  code: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: ArtefactStatus;
  iteration: number;
  citations: Citation[];
}
export interface Gap {
  id: string;
  category: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: string;
  relatedRequirementCodes: string[];
}
export interface KramaDocument {
  id: string;
  type: DocumentType;
  version: number;
  status: ArtefactStatus;
  content: DocumentContent;
  createdAt: string;
}
export interface Run {
  id: string;
  workflowType: string;
  status: "RUNNING" | "WAITING" | "COMPLETED" | "REJECTED" | "FAILED";
  stage: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}
export interface RuleSetVersion {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  changeNote: string | null;
  createdAt: string;
}
export interface ExceptionRow {
  id: string;
  projectId: string;
  ruleKey: string;
  reason: string;
  scope: "PROJECT" | "CHANGE";
  changeRef: string | null;
  expiresAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedBy: { id: string; name: string };
  decidedBy: { id: string; name: string } | null;
  decisionNote: string | null;
}
export interface TokenUsageRow {
  tier: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// ---------- Typed client ----------
export const api = {
  projects: {
    list: () => request<Project[]>("/projects"),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (input: CreateProjectInput) => request<Project>("/projects", { method: "POST", body: json(input) }),
    updateSettings: (id: string, input: { depthMode?: DepthMode; approvedTools?: string[] }) =>
      request<Project>(`/projects/${id}/settings`, { method: "PATCH", body: json(input) }),
  },
  sources: {
    list: (projectId: string) => request<SourceItem[]>(`/projects/${projectId}/sources`),
    upload: (projectId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<SourceItem>(`/projects/${projectId}/sources/upload`, { method: "POST", body: form });
    },
    idhiMeetings: () => request<IdhiMeetingSummary[]>("/integrations/idhi/meetings"),
    importIdhi: (projectId: string, meetingId: string) =>
      request<SourceItem>(`/projects/${projectId}/sources/idhi-import`, { method: "POST", body: json({ meetingId }) }),
  },
  runs: {
    list: (projectId: string) => request<Run[]>(`/projects/${projectId}/runs`),
    startDocumentation: (projectId: string) => request<Run>(`/projects/${projectId}/runs/documentation`, { method: "POST" }),
    tokenUsage: (projectId: string) => request<TokenUsageRow[]>(`/projects/${projectId}/token-usage`),
  },
  requirements: {
    list: (projectId: string) => request<Requirement[]>(`/projects/${projectId}/requirements`),
    submit: (projectId: string) => request<unknown>(`/projects/${projectId}/requirements/submit`, { method: "POST" }),
  },
  gaps: {
    list: (projectId: string) => request<Gap[]>(`/projects/${projectId}/gaps`),
  },
  documents: {
    list: (projectId: string) => request<KramaDocument[]>(`/projects/${projectId}/documents`),
    submit: (projectId: string) => request<unknown>(`/projects/${projectId}/documents/submit`, { method: "POST" }),
  },
  approvals: {
    list: (params: { status?: string; projectId?: string } = {}) => {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
      return request<ApprovalDto[]>(`/approvals${q.size ? `?${q}` : ""}`);
    },
    decide: (id: string, input: DecideApprovalInput) =>
      request<ApprovalDto>(`/approvals/${id}/decide`, { method: "POST", body: json(input) }),
  },
  guardrails: {
    active: () => request<GuardrailRuleSetFile>("/guardrails/active"),
    versions: () => request<RuleSetVersion[]>("/guardrails/versions"),
    publish: (rules: GuardrailRule[], changeNote?: string) =>
      request<GuardrailRuleSetFile>("/guardrails/active", { method: "PUT", body: json({ rules, changeNote }) }),
    effective: (projectId: string) =>
      request<{ mode: DepthMode; guardrails: GuardrailRuleSetFile; exceptions: GuardrailExceptionsFile }>(
        `/projects/${projectId}/guardrails/effective`,
      ),
  },
  exceptions: {
    list: (projectId?: string) => request<ExceptionRow[]>(`/exceptions${projectId ? `?projectId=${projectId}` : ""}`),
    request: (input: RequestExceptionInput) => request<ExceptionRow>("/exceptions", { method: "POST", body: json(input) }),
  },
  capabilities: {
    list: () => request<CapabilityDto[]>("/capabilities"),
  },
  contextPack: {
    get: (projectId: string) => request<ContextPack>(`/projects/${projectId}/context-pack`),
  },
  auth: {
    cliToken: () => request<{ token: string }>("/auth/cli-token", { method: "POST" }),
  },
};
