// Renders Krama documents and packs to Word (.docx) and Markdown.
// Every file carries a footer with project, version, classification and the downloading user (BRD-DG-09).
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export type Block =
  | { kind: "p"; text: string; muted?: boolean }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][]; widths?: number[] };

export interface RenderSection {
  heading: string;
  level?: 1 | 2;
  blocks: Block[];
}

export interface RenderDoc {
  title: string;
  subtitle?: string;
  meta: [string, string][];
  sections: RenderSection[];
  footer: string;
}

const NAVY = "10213F";
const BLUE = "1E6FD9";

function cell(text: string, header = false, width?: number): TableCell {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? { type: ShadingType.CLEAR, color: "auto", fill: "EAF1FB" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: header, size: 19, color: header ? NAVY : undefined })] })],
  });
}

function table(head: string[], rows: string[][], widths?: number[]): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D5DEEC" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, true, widths?.[i])) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, widths?.[i])) })),
    ],
  });
}

export async function toDocx(doc: RenderDoc): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.title, color: NAVY, bold: true })] }),
  ];
  if (doc.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: doc.subtitle, color: "4A5875" })], spacing: { after: 200 } }));
  if (doc.meta.length) children.push(table(["Item", "Detail"], doc.meta.map(([a, b]) => [a, b]), [28, 72]));
  for (const s of doc.sections) {
    children.push(
      new Paragraph({
        heading: s.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: s.heading, color: s.level === 2 ? BLUE : NAVY })],
      }),
    );
    for (const b of s.blocks) {
      if (b.kind === "p") children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: b.text, color: b.muted ? "4A5875" : undefined, italics: b.muted })] }));
      if (b.kind === "bullets") for (const it of b.items) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(it)] }));
      if (b.kind === "table") children.push(table(b.head, b.rows, b.widths), new Paragraph({ text: "" }));
    }
  }
  const document = new Document({
    creator: "Krama",
    title: doc.title,
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: doc.footer, size: 16, color: "4A5875" })] })] }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function toMarkdown(doc: RenderDoc): string {
  const out: string[] = [`# ${doc.title}`, ""];
  if (doc.subtitle) out.push(doc.subtitle, "");
  if (doc.meta.length) {
    out.push("| Item | Detail |", "| --- | --- |", ...doc.meta.map(([a, b]) => `| ${esc(a)} | ${esc(b)} |`), "");
  }
  for (const s of doc.sections) {
    out.push(`${s.level === 2 ? "###" : "##"} ${s.heading}`, "");
    for (const b of s.blocks) {
      if (b.kind === "p") out.push(b.muted ? `_${b.text}_` : b.text, "");
      if (b.kind === "bullets") out.push(...b.items.map((i) => `- ${i}`), "");
      if (b.kind === "table") out.push(`| ${b.head.map(esc).join(" | ")} |`, `| ${b.head.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.map(esc).join(" | ")} |`), "");
    }
  }
  out.push("---", `_${doc.footer}_`, "");
  return out.join("\n");
}

export function footerText(opts: { project: string; version: string; user: string }): string {
  const when = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `Krama · ${opts.project} · ${opts.version} · Confidential · Downloaded by ${opts.user} on ${when} UTC`;
}

// ---------- PDF ----------
// Built-in Helvetica (WinAnsi); characters outside it are replaced with plain equivalents.
const PDF_SUBS: [RegExp, string][] = [[/≥/g, ">="], [/≤/g, "<="], [/[→⇒]/g, "->"], [/₹/g, "Rs "], [/[“”]/g, '"'], [/[‘’]/g, "'"], [/…/g, "..."], [/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•·€]/g, "?"]];
const pdfText = (s: string) => PDF_SUBS.reduce((t, [re, r]) => t.replace(re, r), s);

export async function toPdf(doc: RenderDoc): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");
  const pdf = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 56, right: 56 }, bufferPages: true, info: { Title: doc.title, Creator: "Krama" } });
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => pdf.on("end", () => res(Buffer.concat(chunks))));
  const L = pdf.page.margins.left, W = pdf.page.width - L - pdf.page.margins.right;
  const bottom = () => pdf.page.height - pdf.page.margins.bottom;
  const ensure = (h: number) => { if (pdf.y + h > bottom()) pdf.addPage(); };

  const drawTable = (head: string[], rows: string[][], widths?: number[]) => {
    const total = widths?.reduce((a, b) => a + b, 0) ?? head.length;
    const cols = head.map((_, i) => ((widths?.[i] ?? 1) / total) * W);
    const pad = 5;
    const rowH = (cells: string[], bold: boolean) => {
      pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      return Math.max(...cells.map((c, i) => pdf.heightOfString(pdfText(c), { width: cols[i]! - 2 * pad }))) + 2 * pad;
    };
    const drawRow = (cells: string[], header: boolean) => {
      const h = rowH(cells, header);
      if (pdf.y + h > bottom()) { pdf.addPage(); if (!header) drawRow(head, true); }
      const y = pdf.y; let x = L;
      cells.forEach((c, i) => {
        if (header) pdf.rect(x, y, cols[i]!, h).fill("#EAF1FB");
        pdf.rect(x, y, cols[i]!, h).lineWidth(0.5).strokeColor("#D5DEEC").stroke();
        pdf.fillColor(header ? "#10213F" : "#1F2937").font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
          .text(pdfText(c), x + pad, y + pad, { width: cols[i]! - 2 * pad });
        x += cols[i]!;
      });
      pdf.x = L; pdf.y = y + h;
    };
    drawRow(head, true);
    for (const r of rows) drawRow(r, false);
    pdf.moveDown(0.8);
  };

  pdf.fillColor("#10213F").font("Helvetica-Bold").fontSize(20).text(pdfText(doc.title), L, pdf.y, { width: W });
  if (doc.subtitle) pdf.moveDown(0.2).fillColor("#4A5875").font("Helvetica").fontSize(11).text(pdfText(doc.subtitle), { width: W });
  pdf.moveDown(0.8);
  if (doc.meta.length) drawTable(["Item", "Detail"], doc.meta.map(([a, b]) => [a, b]), [28, 72]);
  for (const s of doc.sections) {
    ensure(60);
    pdf.moveDown(0.4).fillColor(s.level === 2 ? "#1E6FD9" : "#10213F").font("Helvetica-Bold").fontSize(s.level === 2 ? 11.5 : 14).text(pdfText(s.heading), L, pdf.y, { width: W });
    pdf.moveDown(0.4);
    for (const b of s.blocks) {
      if (b.kind === "p") { ensure(30); pdf.fillColor(b.muted ? "#4A5875" : "#1F2937").font(b.muted ? "Helvetica-Oblique" : "Helvetica").fontSize(10).text(pdfText(b.text), L, pdf.y, { width: W }); pdf.moveDown(0.5); }
      if (b.kind === "bullets") { for (const it of b.items) { ensure(20); pdf.fillColor("#1F2937").font("Helvetica").fontSize(10).text(`•  ${pdfText(it)}`, L + 8, pdf.y, { width: W - 8 }); pdf.moveDown(0.15); } pdf.moveDown(0.4); }
      if (b.kind === "table") drawTable(b.head, b.rows, b.widths);
    }
  }
  const range = pdf.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    pdf.switchToPage(range.start + i);
    const y = pdf.page.height - 40;
    pdf.page.margins.bottom = 0;
    pdf.fillColor("#4A5875").font("Helvetica").fontSize(7.5).text(`${pdfText(doc.footer)}  ·  Page ${i + 1} of ${range.count}`, L, y, { width: W, align: "center", lineBreak: false });
  }
  pdf.end();
  return done;
}

export type FileFormat = "docx" | "pdf" | "md";
/** One rendered document as a download in the chosen format. */
export async function renderFile(doc: RenderDoc, baseName: string, format: FileFormat): Promise<{ name: string; type: string; body: Buffer }> {
  if (format === "md") return { name: `${baseName}.md`, type: "text/markdown; charset=utf-8", body: Buffer.from(toMarkdown(doc)) };
  if (format === "pdf") return { name: `${baseName}.pdf`, type: "application/pdf", body: await toPdf(doc) };
  return { name: `${baseName}.docx`, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", body: await toDocx(doc) };
}
