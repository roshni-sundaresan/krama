// Exact message texts from FSD v0.5 section 21 (FSD-G04). The API returns { code, message }.
export const MESSAGES = {
  "MSG-AUTH-01": "Sign-in did not complete. Try again, or contact IT if it keeps failing.",
  "MSG-AUTH-02": "Krama is available only to Idealake accounts. Sign in with your @idealake.com account.",
  "MSG-AUTH-03": "You don't have permission to do this. Ask a Tech Architect or the Super Admin if you need access.",
  "MSG-AUTH-04": "Only @idealake.com email IDs can be given access.",
  "MSG-AUTH-05": "Krama needs at least one Super Admin. Add another Super Admin first.",
  "MSG-UPL-01": "This file type isn't accepted. Upload PDF, DOCX, XLSX, PPTX, TXT, MD, WSDL, XSD, JSON, YAML or ZIP.",
  "MSG-UPL-02": "This file is larger than the limit of {limit}. Split it or remove large attachments.",
  "MSG-UPL-03": "This file failed the security scan and was not stored. Check the file with IT.",
  "MSG-UPL-04": "Tag this document before it can be used: type, version, date and provider.",
  "MSG-GEN-01": "Personal data was found in {file}. Review the masking before Krama drafts from it.",
  "MSG-GEN-02": "Krama removed sensitive data from this draft. Review the highlighted text.",
  "MSG-GEN-03": "{n} statements are AI-drafted and unconfirmed. Confirm or remove them before submitting.",
  "MSG-DOC-01": "Submission is blocked: {n} critical findings. Resolve them or ask the BA Lead for an exception.",
  "MSG-DOC-02": "The FSD opens after the client signs off the BRD. Record the sign-off evidence first.",
  "MSG-STK-01": "Confirm the project domain before saving the stack.",
  "MSG-STK-02": "This pack is waiting for Tech Architect approval and can't be downloaded yet.",
  "MSG-DEV-01": "Tick every item on the software checklist before confirming.",
  "MSG-DEV-02": "Krama couldn't read this repository. Check the link and access, or upload a ZIP instead.",
} as const;
export type MessageCode = keyof typeof MESSAGES;

export function msg(code: MessageCode, vars: Record<string, string | number> = {}): { code: MessageCode; message: string } {
  return { code, message: MESSAGES[code].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) };
}
