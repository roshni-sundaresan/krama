import { extname } from "node:path";
import { connect } from "node:net";

/** Accepted upload types (FSD VAL-UPL-01). */
export const ACCEPTED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".wsdl", ".xsd", ".xml", ".vtt", ".zip",
]);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".wsdl", ".xsd", ".xml", ".vtt"]);
const MAX_TEXT = 300_000;

export function extensionOf(filename: string): string {
  return extname(filename).toLowerCase();
}

/** Extract plain text from an upload. Returns null for formats without text (images, zip, xlsx, pptx). */
export async function extractText(buf: Buffer, filename: string): Promise<string | null> {
  const ext = extensionOf(filename);
  if (TEXT_EXTENSIONS.has(ext)) return buf.toString("utf8").slice(0, MAX_TEXT);
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value.slice(0, MAX_TEXT);
  }
  if (ext === ".pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return String(text).slice(0, MAX_TEXT);
  }
  return null;
}

// EICAR test signature: lets teams verify the scan path without real malware.
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export interface ScanResult {
  clean: boolean;
  engine: string;
  signature?: string;
}

/**
 * Malware scan before storage (BRD-DG-01). Uses a ClamAV daemon when CLAMAV_HOST is set,
 * otherwise a built-in check for the EICAR test file and executable headers.
 */
export async function scanBuffer(buf: Buffer, opts: { host?: string; port: number }): Promise<ScanResult> {
  if (opts.host) return clamdScan(buf, opts.host, opts.port);
  const head = buf.subarray(0, 4).toString("binary");
  if (buf.includes(Buffer.from(EICAR))) return { clean: false, engine: "builtin", signature: "EICAR-Test-File" };
  if (head.startsWith("MZ") || head === "\x7fELF") return { clean: false, engine: "builtin", signature: "Executable" };
  return { clean: true, engine: "builtin" };
}

function clamdScan(buf: Buffer, host: string, port: number): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port }, () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    let out = "";
    socket.setTimeout(30_000, () => socket.destroy(new Error("ClamAV timeout")));
    socket.on("data", (d) => (out += d.toString()));
    socket.on("end", () => {
      const reply = out.replace(/\0/g, "").trim();
      if (reply.endsWith("OK")) resolve({ clean: true, engine: "clamav" });
      else resolve({ clean: false, engine: "clamav", signature: reply.replace(/^stream:\s*/, "").replace(/\s*FOUND$/, "") });
    });
    socket.on("error", reject);
  });
}
