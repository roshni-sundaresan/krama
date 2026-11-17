// Personal and financial data masking before any AI call (IN-G01, BRD-DG-02).
// Pattern based for Phase 1; Microsoft Presidio can replace or extend this later.

export type PiiType = "EMAIL" | "PHONE" | "PAN" | "AADHAAR" | "CARD" | "ACCOUNT" | "IFSC";

export interface PiiFinding {
  type: PiiType;
  count: number;
}

interface Detector {
  type: PiiType;
  re: RegExp;
  replace: (m: string) => string;
  validate?: (m: string) => boolean;
}

function luhn(digits: string): boolean {
  const d = digits.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const keepLast = (m: string, n = 4) => {
  const digits = m.replace(/\D/g, "");
  return "X".repeat(Math.max(0, digits.length - n)) + digits.slice(-n);
};

const DETECTORS: Detector[] = [
  { type: "EMAIL", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replace: () => "[EMAIL]" },
  { type: "PAN", re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, replace: () => "[PAN]" },
  { type: "IFSC", re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, replace: () => "[IFSC]" },
  { type: "CARD", re: /\b(?:\d[ -]?){13,19}\b/g, replace: (m) => `[CARD ${keepLast(m)}]`, validate: luhn },
  { type: "AADHAAR", re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g, replace: () => "[AADHAAR]" },
  { type: "PHONE", re: /(?:\+91[\s-]?|\b0)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, replace: () => "[PHONE]" },
  {
    type: "ACCOUNT",
    re: /\b(?:a\/c|acct|account)(?:\s*(?:no\.?|number))?\s*[:#-]?\s*\d{9,18}\b/gi,
    replace: (m) => m.replace(/\d{9,18}/, (d) => `[ACCOUNT ${keepLast(d)}]`),
  },
];

export interface MaskResult {
  masked: string;
  findings: PiiFinding[];
  total: number;
}

/** Replace personal and financial identifiers. Same input gives the same output. */
export function maskPersonalData(text: string): MaskResult {
  let masked = text;
  const counts = new Map<PiiType, number>();
  for (const d of DETECTORS) {
    masked = masked.replace(d.re, (m) => {
      if (d.validate && !d.validate(m)) return m;
      counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
      return d.replace(m);
    });
  }
  const findings = [...counts.entries()].map(([type, count]) => ({ type, count }));
  return { masked, findings, total: findings.reduce((s, f) => s + f.count, 0) };
}

/** Patterns that look like instructions to an AI inside uploaded content (BRD-DG-03). */
const INJECTION = [
  /ignore (all |any )?(previous|prior|above) instructions/i,
  /disregard (the )?(system|previous) prompt/i,
  /you are now [a-z]/i,
  /reveal (the )?(system prompt|instructions)/i,
];
export function findInjectionAttempts(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split(/\r?\n/)) if (INJECTION.some((re) => re.test(line))) hits.push(line.trim().slice(0, 200));
  return hits;
}
