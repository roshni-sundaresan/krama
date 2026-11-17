import { NextResponse } from "next/server";
import { api } from "@/lib/api";

/** Download the latest Deep Audit report as JSON. */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const ws = await api<{ project: { code: string }; document: { version: number } | null; audit: { aiReport: unknown; ruleFindings: unknown; status: string; createdAt: string } | null }>(`/projects/${projectId}/brd`);
  if (!ws.audit) return NextResponse.json({ message: "No Deep Audit has run yet" }, { status: 404 });
  const body = JSON.stringify({ status: ws.audit.status, ranAt: ws.audit.createdAt, ruleFindings: ws.audit.ruleFindings, ...(ws.audit.aiReport as object) }, null, 2);
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${ws.project.code}_BRD_v${ws.document?.version ?? 0}_DeepAudit.json"`,
      "cache-control": "no-store",
    },
  });
}
