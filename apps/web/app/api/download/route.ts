import { NextResponse, type NextRequest } from "next/server";
import { raw } from "@/lib/api";

// Only these API paths may be fetched through the proxy (files, never JSON data APIs).
const ALLOWED = [
  /^\/documents\/[\w-]+\/export(\?format=(docx|md))?$/,
  /^\/projects\/[\w-]+\/packs\/[\w-]+\/download\?[\w=&%.-]*$/,
  /^\/projects\/[\w-]+\/sources\/[\w-]+\/file$/,
  /^\/library\/download\?[\w=&%.-]*$/,
];

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!ALLOWED.some((r) => r.test(path))) return NextResponse.json({ message: "Not a downloadable file" }, { status: 400 });
  const res = await raw(path);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return new NextResponse(`<p style="font-family:sans-serif">${(body.message ?? res.statusText).replace(/[<>&]/g, "")}</p><p><a href="javascript:history.back()">Go back</a></p>`, {
      status: res.status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return new NextResponse(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition": res.headers.get("content-disposition") ?? "attachment",
      "cache-control": "no-store",
    },
  });
}
