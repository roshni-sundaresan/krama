// Master guardrails and blueprints (BRD v0.6 sections 10.2, 10.3, 10.5; FSD v0.5 section 20.4).
// Krama composes a project's packs from these entries using the project's domain, entity type,
// platforms, stack and flags. Each pack names the regulation versions it uses (BRD-GR-05).
import type { Domain, EntityType } from "./domain.js";
import type { RuleType } from "./guardrails.js";
import type { Role } from "./roles.js";

export const VERTICALS = ["TECHNOLOGY", "BA", "DESIGN", "INFRASTRUCTURE", "TESTING"] as const;
export type Vertical = (typeof VERTICALS)[number];
export const VERTICAL_LABELS: Record<Vertical, string> = {
  TECHNOLOGY: "Technology",
  BA: "Business Analysis",
  DESIGN: "Design",
  INFRASTRUCTURE: "Infrastructure",
  TESTING: "Testing",
};

export type CatalogLevel = "NON_WAIVABLE" | "BLOCK" | "WARN";
export type ProjectFlag = "government" | "existingProduction" | "accessibility";

export interface Regulation {
  id: string;
  name: string;
  version: string;
}

export const REGULATIONS: Regulation[] = [
  { id: "RBI-CB-2026", name: "RBI (Commercial Banks – Cybersecurity, Technology: Risk, Resilience and Assurance Framework) Directions, 2026", version: "31 Jul 2026" },
  { id: "RBI-ITGRCA-2023", name: "RBI Master Direction on IT Governance, Risk, Controls and Assurance Practices", version: "7 Nov 2023, effective 1 Apr 2024" },
  { id: "RBI-PSO-2024", name: "RBI Master Directions on Cyber Resilience and Digital Payment Security Controls for non-bank PSOs", version: "Jul 2024" },
  { id: "RBI-DATA-2018", name: "RBI circular on Storage of Payment System Data", version: "6 Apr 2018" },
  { id: "IRDAI-2026", name: "IRDAI Information and Cyber Security Guidelines", version: "6 Apr 2026" },
  { id: "SEBI-CSCRF", name: "SEBI Cybersecurity and Cyber Resilience Framework (CSCRF)", version: "20 Aug 2024" },
  { id: "DPDP", name: "Digital Personal Data Protection Act and Rules", version: "2023; Rules 2025" },
  { id: "CERTIN-2022", name: "CERT-In Directions under section 70B(6) of the IT Act", version: "28 Apr 2022" },
  { id: "OWASP-TOP10", name: "OWASP Top 10", version: "2025" },
  { id: "OWASP-API", name: "OWASP API Security Top 10", version: "2023" },
  { id: "OWASP-MASVS", name: "OWASP MASVS", version: "v2.1" },
  { id: "OWASP-ASVS", name: "OWASP ASVS", version: "5.0" },
  { id: "WCAG", name: "W3C Web Content Accessibility Guidelines, Level AA", version: "2.2 (5 Oct 2023)" },
  { id: "GIGW", name: "Guidelines for Indian Government Websites and Apps", version: "3.0 (2023)" },
];

export interface AppliesWhen {
  domains?: Domain[];
  entityTypes?: EntityType[];
  /** Any of these platforms on the project. */
  platforms?: string[];
  /** Any of these stack topics. */
  stackTopics?: string[];
  flags?: ProjectFlag[];
}

export interface CatalogRule {
  id: string;
  vertical: Vertical;
  topic: string;
  title: string;
  text: string;
  level: CatalogLevel;
  sources?: string[];
  when?: AppliesWhen;
  /** Machine check used by the optional project check. */
  check?: { type: RuleType; params: Record<string, unknown>; appliesTo?: string[] };
}

export const TOPIC_LABELS: Record<string, string> = {
  security: "Security baseline",
  owasp: "OWASP",
  accessibility: "Accessibility",
  vapt: "VAPT",
  bfsi: "BFSI regulation",
  "mutual-funds": "Mutual Funds regulation",
  "existing-production": "Existing and client production systems",
  flutter: "Flutter",
  node: "Node.js and NestJS",
  react: "React and Next.js",
  "react-native": "React Native",
  dotnet: ".NET",
  java: "Java and Spring",
  "ba-intake": "Intake",
  "ba-requirements": "Requirements",
  "ba-documents": "BRD, FSD and API specification",
  "design-system": "Design system and hand-off",
  "infra-env": "Environments and CI/CD",
  "infra-data": "Data protection and recovery",
  "test-functional": "Functional testing",
  "test-api": "API testing",
  "test-security": "Security testing",
  "test-accessibility": "Accessibility testing",
  "test-mobile": "Mobile testing",
};

const MOBILE = ["Mobile iOS", "Mobile Android", "Tablet"];
const UI = ["Web", "Mobile iOS", "Mobile Android", "Tablet", "Desktop"];

export const CATALOG: CatalogRule[] = [
  // ---------------- Technology: security baseline ----------------
  { id: "SEC-G01", vertical: "TECHNOLOGY", topic: "security", level: "NON_WAIVABLE", title: "No hardcoded secrets", text: "No passwords, keys, tokens or connection strings in code, config or test files. Secrets come from the secrets store.", sources: ["OWASP-TOP10"], check: { type: "no-secrets", params: {} } },
  { id: "SEC-G02", vertical: "TECHNOLOGY", topic: "security", level: "BLOCK", title: "Authorisation on the server", text: "Every API checks the caller's role and ownership of the record on the server; screens only hide what the server already refuses.", sources: ["OWASP-TOP10", "OWASP-API"] },
  { id: "SEC-G03", vertical: "TECHNOLOGY", topic: "security", level: "BLOCK", title: "Encrypt data in transit", text: "All external calls use HTTPS with TLS 1.2 or higher. No plain http:// endpoints outside localhost.", sources: ["OWASP-TOP10"], check: { type: "prohibited-pattern", params: { patterns: ["http://(?!localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|schemas\\.|www\\.w3\\.org)"], message: "Plain http:// URL" }, appliesTo: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.dart", "**/*.java", "**/*.cs", "**/*.kt", "**/*.json", "**/*.yaml", "**/*.yml"] } },
  { id: "SEC-G04", vertical: "TECHNOLOGY", topic: "security", level: "BLOCK", title: "Validate input, encode output", text: "Validate every input on the server against a schema; use parameterised queries; encode output for its context.", sources: ["OWASP-TOP10"], check: { type: "prohibited-pattern", params: { patterns: ["\\beval\\s*\\(", "new Function\\s*\\("], message: "Dynamic code execution" } } },
  { id: "SEC-G05", vertical: "TECHNOLOGY", topic: "security", level: "BLOCK", title: "Safe logging", text: "Logs carry user, time and outcome but never passwords, tokens or unmasked personal data.", sources: ["OWASP-TOP10", "CERTIN-2022"] },
  { id: "SEC-G06", vertical: "TECHNOLOGY", topic: "security", level: "BLOCK", title: "Dependencies from approved sources", text: "Libraries come from approved registries, are scanned for known vulnerabilities and are listed in a software bill of materials.", sources: ["OWASP-TOP10"] },
  { id: "SEC-G07", vertical: "TECHNOLOGY", topic: "security", level: "WARN", title: "Keep files reviewable", text: "Source files stay under 500 lines so reviews and AI agents can reason about them.", check: { type: "max-file-length", params: { maxLines: 500 }, appliesTo: ["**/*.ts", "**/*.tsx", "**/*.dart", "**/*.java", "**/*.cs", "**/*.kt", "**/*.py"] } },
  { id: "SEC-G08", vertical: "TECHNOLOGY", topic: "security", level: "BLOCK", title: "Tests alongside code", text: "Every repository has automated tests that run in CI.", check: { type: "require-tests-dir", params: { dirs: ["test", "tests", "__tests__", "src/test", "integration_test", "spec"] } } },

  // ---------------- OWASP ----------------
  { id: "OWASP-G01", vertical: "TECHNOLOGY", topic: "owasp", level: "BLOCK", title: "OWASP Top 10:2025", text: "Design, code and test against all ten 2025 categories, starting with broken access control, security misconfiguration and software supply chain failures.", sources: ["OWASP-TOP10"] },
  { id: "OWASP-G02", vertical: "TECHNOLOGY", topic: "owasp", level: "BLOCK", title: "OWASP API Security Top 10:2023", text: "Every API enforces object-level and function-level authorisation, rate limits and schema validation.", sources: ["OWASP-API"], when: { platforms: ["API", "Integration"] } },
  { id: "OWASP-G03", vertical: "TECHNOLOGY", topic: "owasp", level: "BLOCK", title: "OWASP MASVS v2.1 for mobile", text: "Mobile apps meet MASVS storage, crypto, auth, network, platform, code and resilience controls.", sources: ["OWASP-MASVS"], when: { platforms: MOBILE } },
  { id: "OWASP-G04", vertical: "TECHNOLOGY", topic: "owasp", level: "BLOCK", title: "OWASP ASVS 5.0 Level 2", text: "Verify the application to ASVS 5.0 Level 2.", sources: ["OWASP-ASVS"], when: { domains: ["BFSI", "MUTUAL_FUNDS"] } },
  { id: "OWASP-G05", vertical: "TECHNOLOGY", topic: "owasp", level: "BLOCK", title: "OWASP ASVS 5.0 Level 1", text: "Verify the application to ASVS 5.0 Level 1.", sources: ["OWASP-ASVS"], when: { domains: ["GENERAL"] } },

  // ---------------- BFSI ----------------
  { id: "BFSI-G01", vertical: "TECHNOLOGY", topic: "bfsi", level: "NON_WAIVABLE", title: "Mask personal and financial data", text: "Account, card, PAN, Aadhaar and KYC data is masked on screens, in logs, in test data and in anything sent to an AI model. Full card numbers are not stored.", sources: ["DPDP"], when: { domains: ["BFSI"] } },
  { id: "BFSI-G02", vertical: "INFRASTRUCTURE", topic: "bfsi", level: "NON_WAIVABLE", title: "Payment data stays in India", text: "Payment system data is stored only in India.", sources: ["RBI-DATA-2018"], when: { domains: ["BFSI"] } },
  { id: "BFSI-G03", vertical: "TECHNOLOGY", topic: "bfsi", level: "BLOCK", title: "Encryption and key management", text: "TLS 1.2 or higher in transit; AES-256 for personal and financial data at rest; keys in an HSM or managed key service, rotated.", sources: ["RBI-CB-2026", "IRDAI-2026"], when: { domains: ["BFSI"] } },
  { id: "BFSI-G04", vertical: "TECHNOLOGY", topic: "bfsi", level: "BLOCK", title: "Multi-factor authentication", text: "MFA for all admin access and for customer high-risk actions: new device sign-in, adding a payee, payments above the client limit, contact changes.", sources: ["RBI-CB-2026", "IRDAI-2026"], when: { domains: ["BFSI"] } },
  { id: "BFSI-G05", vertical: "TECHNOLOGY", topic: "bfsi", level: "BLOCK", title: "Maker-checker", text: "Changes to financial or master data are entered by one person and approved by another.", sources: ["RBI-ITGRCA-2023"], when: { domains: ["BFSI"] } },
  { id: "BFSI-G06", vertical: "TECHNOLOGY", topic: "bfsi", level: "BLOCK", title: "Threat model per release", text: "Each release of a critical application has a threat model and security testing that is not limited to the OWASP Top 10.", sources: ["RBI-CB-2026"], when: { domains: ["BFSI"], entityTypes: ["COMMERCIAL_BANK"] } },
  { id: "BFSI-G07", vertical: "TECHNOLOGY", topic: "bfsi", level: "BLOCK", title: "Vendor security confirmation", text: "Each release includes Idealake's written confirmation that the application is free of known vulnerabilities, malware and covert channels.", sources: ["RBI-CB-2026"], when: { domains: ["BFSI"], entityTypes: ["COMMERCIAL_BANK"] } },
  { id: "BFSI-G08", vertical: "INFRASTRUCTURE", topic: "bfsi", level: "BLOCK", title: "Web application firewall", text: "Web-facing applications sit behind a web application firewall.", sources: ["IRDAI-2026"], when: { domains: ["BFSI"], entityTypes: ["INSURER"] } },
  { id: "BFSI-G09", vertical: "INFRASTRUCTURE", topic: "bfsi", level: "BLOCK", title: "Logs kept in India for 180 days", text: "Security logs are tamper-evident, time-synchronised and kept in India for at least 180 days.", sources: ["CERTIN-2022"], when: { domains: ["BFSI", "MUTUAL_FUNDS"] } },
  { id: "BFSI-G10", vertical: "INFRASTRUCTURE", topic: "bfsi", level: "BLOCK", title: "Incident reporting within 6 hours", text: "The application alerts the client's SOC; Idealake tells the client about a suspected incident at once so it can report within 6 hours.", sources: ["CERTIN-2022", "RBI-CB-2026", "IRDAI-2026"], when: { domains: ["BFSI", "MUTUAL_FUNDS"] } },
  { id: "BFSI-G11", vertical: "TECHNOLOGY", topic: "bfsi", level: "BLOCK", title: "Device integrity on mobile", text: "Root and jailbreak detection, certificate pinning and no sensitive data in local storage.", sources: ["OWASP-MASVS"], when: { domains: ["BFSI", "MUTUAL_FUNDS"], platforms: MOBILE } },
  { id: "BFSI-G12", vertical: "TECHNOLOGY", topic: "bfsi", level: "BLOCK", title: "Payment data scope for non-bank PSOs", text: "Payment flows meet the RBI digital payment security controls for non-bank payment system operators.", sources: ["RBI-PSO-2024"], when: { domains: ["BFSI"], entityTypes: ["PAYMENT_OPERATOR"] } },
  { id: "BFSI-G13", vertical: "BA", topic: "bfsi", level: "BLOCK", title: "Transaction alerts", text: "Customers get an SMS or email alert for every financial transaction.", sources: ["RBI-ITGRCA-2023"], when: { domains: ["BFSI"], entityTypes: ["COMMERCIAL_BANK", "NBFC_OTHER_BANK"] } },

  // ---------------- Mutual Funds ----------------
  { id: "MF-G01", vertical: "TECHNOLOGY", topic: "mutual-funds", level: "BLOCK", title: "SEBI CSCRF controls", text: "Apply the CSCRF controls for the client's entity category: governance, identify, protect, detect, respond and recover.", sources: ["SEBI-CSCRF"], when: { domains: ["MUTUAL_FUNDS"] } },
  { id: "MF-G02", vertical: "TESTING", topic: "mutual-funds", level: "BLOCK", title: "VAPT by CERT-In empanelled auditors", text: "VAPT twice a year for Qualified entities and once a year for others, by CERT-In empanelled auditors only; findings closed within 3 months of the report.", sources: ["SEBI-CSCRF"], when: { domains: ["MUTUAL_FUNDS"] } },
  { id: "MF-G03", vertical: "TECHNOLOGY", topic: "mutual-funds", level: "NON_WAIVABLE", title: "Mask investor data", text: "PAN, folio, bank and KYC data is masked on screens, logs, test data and AI calls.", sources: ["DPDP", "SEBI-CSCRF"], when: { domains: ["MUTUAL_FUNDS"] } },

  // ---------------- Accessibility ----------------
  { id: "ACC-G01", vertical: "DESIGN", topic: "accessibility", level: "BLOCK", title: "Text alternatives", text: "Every meaningful image, icon and chart has a text alternative (WCAG 1.1.1).", sources: ["WCAG"], when: { flags: ["accessibility", "government"] }, check: { type: "prohibited-pattern", params: { patterns: ["<img(?![^>]*\\balt=)[^>]*>"], message: "Image without alt text" }, appliesTo: ["**/*.tsx", "**/*.jsx", "**/*.html"] } },
  { id: "ACC-G02", vertical: "DESIGN", topic: "accessibility", level: "BLOCK", title: "Contrast", text: "Text contrast at least 4.5:1 (3:1 for large text); icons and focus rings at least 3:1 (1.4.3, 1.4.11).", sources: ["WCAG"], when: { flags: ["accessibility", "government"] } },
  { id: "ACC-G03", vertical: "DESIGN", topic: "accessibility", level: "BLOCK", title: "Keyboard and focus", text: "Everything works by keyboard with a visible focus that is never hidden by sticky elements (2.1.1, 2.4.7, 2.4.11).", sources: ["WCAG"], when: { flags: ["accessibility", "government"] } },
  { id: "ACC-G04", vertical: "DESIGN", topic: "accessibility", level: "BLOCK", title: "Target size", text: "Targets at least 24 by 24 CSS pixels; 44 pt on iOS and 48 dp on Android (2.5.8).", sources: ["WCAG"], when: { flags: ["accessibility", "government"] } },
  { id: "ACC-G05", vertical: "DESIGN", topic: "accessibility", level: "BLOCK", title: "Labels and errors", text: "Every input has a visible label; errors name the field and how to fix it (3.3.1, 3.3.2).", sources: ["WCAG"], when: { flags: ["accessibility", "government"] } },
  { id: "ACC-G06", vertical: "DESIGN", topic: "accessibility", level: "BLOCK", title: "Accessible sign-in", text: "No memory or puzzle tests at sign-in; paste and password managers allowed (3.3.8).", sources: ["WCAG"], when: { flags: ["accessibility", "government"] } },
  { id: "ACC-G07", vertical: "TECHNOLOGY", topic: "accessibility", level: "BLOCK", title: "Name, role, state", text: "Custom components expose name, role, state and value to assistive technology (4.1.2).", sources: ["WCAG"], when: { flags: ["accessibility", "government"] } },
  { id: "ACC-G08", vertical: "DESIGN", topic: "accessibility", level: "BLOCK", title: "GIGW 3.0", text: "Government projects meet GIGW 3.0, including bilingual content and an accessibility statement.", sources: ["GIGW"], when: { flags: ["government"] } },

  // ---------------- VAPT ----------------
  { id: "VAPT-G01", vertical: "TESTING", topic: "vapt", level: "BLOCK", title: "Written VAPT scope", text: "URLs, builds, APIs, environments and roles in scope are agreed with the client before testing.", when: { domains: ["BFSI", "MUTUAL_FUNDS"] } },
  { id: "VAPT-G02", vertical: "TESTING", topic: "vapt", level: "BLOCK", title: "Own scans first", text: "SAST, dependency, secrets and DAST scans run before handing a build to the auditor, with no Critical or High finding open.", when: { domains: ["BFSI", "MUTUAL_FUNDS"] } },
  { id: "VAPT-G03", vertical: "TESTING", topic: "vapt", level: "NON_WAIVABLE", title: "No Critical or High at go-live", text: "No Critical or High VAPT finding is open at go-live.", sources: ["RBI-CB-2026", "IRDAI-2026", "SEBI-CSCRF"], when: { domains: ["BFSI", "MUTUAL_FUNDS"] } },
  { id: "VAPT-G04", vertical: "TESTING", topic: "vapt", level: "BLOCK", title: "Frequency by regulator", text: "Commercial banks: VA every 6 months, PT every 12 months, plus before and after go-live and after changes. Insurers: grey or white box PT every 6 months by a CERT-In empanelled auditor.", sources: ["RBI-CB-2026", "IRDAI-2026"], when: { domains: ["BFSI"] } },
  { id: "VAPT-G05", vertical: "TESTING", topic: "vapt", level: "BLOCK", title: "Fix timelines", text: "Critical within 7 days, High within 15, Medium within 30, Low within 90 or accepted in writing; retest every fix.", when: { domains: ["BFSI", "MUTUAL_FUNDS"] } },

  // ---------------- Existing and client production ----------------
  { id: "PROD-G01", vertical: "TECHNOLOGY", topic: "existing-production", level: "BLOCK", title: "No breaking changes", text: "No breaking change to existing APIs, database schemas or contracts without an approved change request.", when: { flags: ["existingProduction"] } },
  { id: "PROD-G02", vertical: "TECHNOLOGY", topic: "existing-production", level: "BLOCK", title: "Backward compatibility", text: "New versions stay backward compatible; deprecations are announced and dated.", when: { flags: ["existingProduction"] } },
  { id: "PROD-G03", vertical: "TESTING", topic: "existing-production", level: "BLOCK", title: "Regression tests for changed areas", text: "Every changed area has regression tests that run before merge.", when: { flags: ["existingProduction"] }, check: { type: "require-tests-dir", params: { dirs: ["test", "tests", "__tests__", "src/test", "integration_test", "spec"] } } },
  { id: "PROD-G04", vertical: "TECHNOLOGY", topic: "existing-production", level: "WARN", title: "New rules for new code", text: "New guardrails apply to new and changed code; existing code is listed as a gap, not rewritten.", when: { flags: ["existingProduction"] } },

  // ---------------- Stack specific ----------------
  { id: "FLT-G01", vertical: "TECHNOLOGY", topic: "flutter", level: "BLOCK", title: "Secure storage for tokens", text: "Tokens and secrets use flutter_secure_storage, never SharedPreferences.", when: { stackTopics: ["flutter"] }, check: { type: "prohibited-pattern", params: { patterns: ["SharedPreferences[\\s\\S]{0,80}(token|password|secret)"], message: "Sensitive value in SharedPreferences" }, appliesTo: ["**/*.dart"] } },
  { id: "FLT-G02", vertical: "TECHNOLOGY", topic: "flutter", level: "WARN", title: "No print in app code", text: "Use a logger with levels; print() leaks data to device logs.", when: { stackTopics: ["flutter"] }, check: { type: "prohibited-pattern", params: { patterns: ["(^|\\s)print\\("], message: "print() call" }, appliesTo: ["lib/**/*.dart"] } },
  { id: "FLT-G03", vertical: "TECHNOLOGY", topic: "flutter", level: "BLOCK", title: "State and structure", text: "Feature-first folders; one state management approach agreed in the ADR; widgets stay small and tested." , when: { stackTopics: ["flutter"] } },
  { id: "NODE-G01", vertical: "TECHNOLOGY", topic: "node", level: "BLOCK", title: "Validation pipes and DTOs", text: "Every NestJS endpoint validates its body and params with a schema; no untyped any in request handlers.", when: { stackTopics: ["node"] } },
  { id: "NODE-G02", vertical: "TECHNOLOGY", topic: "node", level: "WARN", title: "No console logging", text: "Use the structured logger; console.log is removed before merge.", when: { stackTopics: ["node"] }, check: { type: "prohibited-pattern", params: { patterns: ["console\\.log\\("], message: "console.log call" }, appliesTo: ["src/**/*.ts", "apps/**/*.ts"] } },
  { id: "REACT-G01", vertical: "TECHNOLOGY", topic: "react", level: "BLOCK", title: "No raw HTML injection", text: "dangerouslySetInnerHTML only with sanitised content and a reviewer's approval.", when: { stackTopics: ["react"] }, check: { type: "prohibited-pattern", params: { patterns: ["dangerouslySetInnerHTML"], message: "Raw HTML injection" }, appliesTo: ["**/*.tsx", "**/*.jsx"] } },
  { id: "RN-G01", vertical: "TECHNOLOGY", topic: "react-native", level: "BLOCK", title: "Keychain for secrets", text: "Tokens use the Keychain or Keystore (for example react-native-keychain), never AsyncStorage.", when: { stackTopics: ["react-native"] }, check: { type: "prohibited-pattern", params: { patterns: ["AsyncStorage\\.setItem\\([^)]*(token|password|secret)"], message: "Sensitive value in AsyncStorage" }, appliesTo: ["**/*.ts", "**/*.tsx", "**/*.js"] } },
  { id: "NET-G01", vertical: "TECHNOLOGY", topic: "dotnet", level: "BLOCK", title: "Parameterised data access", text: "Use EF Core or parameterised commands; no string-built SQL.", when: { stackTopics: ["dotnet"] }, check: { type: "prohibited-pattern", params: { patterns: ["SqlCommand\\(\\s*\\$\""], message: "Interpolated SQL" }, appliesTo: ["**/*.cs"] } },
  { id: "JAVA-G01", vertical: "TECHNOLOGY", topic: "java", level: "BLOCK", title: "Prepared statements", text: "Use JPA or prepared statements; no concatenated SQL.", when: { stackTopics: ["java"] }, check: { type: "prohibited-pattern", params: { patterns: ["createStatement\\(\\)\\.execute(Query)?\\(\\s*\"[^\"]*\"\\s*\\+"], message: "Concatenated SQL" }, appliesTo: ["**/*.java"] } },

  // ---------------- BA ----------------
  { id: "IN-G01", vertical: "BA", topic: "ba-intake", level: "NON_WAIVABLE", title: "Mask before AI", text: "Documents marked as containing personal data are masked before any AI processing." },
  { id: "IN-G02", vertical: "BA", topic: "ba-intake", level: "BLOCK", title: "Intake form and sign-off owner", text: "Intake form complete, with the client sign-off owner named." },
  { id: "IN-G03", vertical: "BA", topic: "ba-intake", level: "BLOCK", title: "SOW uploaded", text: "The SOW is in the intake pack." },
  { id: "IN-G04", vertical: "BA", topic: "ba-intake", level: "BLOCK", title: "MOM or client document", text: "At least one MOM or client requirement document is uploaded or imported." },
  { id: "IN-G05", vertical: "BA", topic: "ba-intake", level: "BLOCK", title: "Every document tagged", text: "Each document is tagged with type, version, date and provider." },
  { id: "BA-G01", vertical: "BA", topic: "ba-requirements", level: "NON_WAIVABLE", title: "Every requirement has a source", text: "Each requirement links to an iDhi meeting, MOM or document." },
  { id: "BA-G05", vertical: "BA", topic: "ba-requirements", level: "BLOCK", title: "Given / When / Then", text: "Every functional requirement has at least one acceptance criterion in Given / When / Then." },
  { id: "BA-G07", vertical: "BA", topic: "ba-requirements", level: "BLOCK", title: "No blocking open questions", text: "No open question marked Blocking is unresolved at approval." },
  { id: "BA-G09", vertical: "BA", topic: "ba-requirements", level: "BLOCK", title: "Key NFRs stated", text: "Performance, security, accessibility and data retention NFRs are stated or marked not applicable with a reason." },
  { id: "BA-G10", vertical: "BA", topic: "ba-requirements", level: "BLOCK", title: "AI drafts confirmed", text: "AI-drafted requirements cite a source and are confirmed by a BA." },
  { id: "BA-G13", vertical: "BA", topic: "ba-requirements", level: "WARN", title: "No vague words", text: "No vague words such as fast, user-friendly, seamless, real-time or as appropriate." },
  { id: "BRD-G02", vertical: "BA", topic: "ba-documents", level: "BLOCK", title: "All 20 BRD sections", text: "All 20 sections are present or marked not applicable with a reason." },
  { id: "BRD-G11", vertical: "BA", topic: "ba-documents", level: "BLOCK", title: "Deep Audit gate", text: "The Deep Audit reports no CRITICAL_BLOCKER and a status other than BLOCKED_HIGH_RISK." },
  { id: "API-G01", vertical: "BA", topic: "ba-documents", level: "BLOCK", title: "API contracts validate", text: "REST contracts validate as OpenAPI 3.1; XML contracts validate against their WSDL and XSD." , when: { platforms: ["API", "Integration"] } },

  // ---------------- Design ----------------
  { id: "DES-G01", vertical: "DESIGN", topic: "design-system", level: "BLOCK", title: "Design tokens", text: "Colours, type and spacing come from the design system tokens." },
  { id: "DES-G02", vertical: "DESIGN", topic: "design-system", level: "BLOCK", title: "Every screen state", text: "Each screen shows empty, loading, error and success states." },
  { id: "DES-G03", vertical: "DESIGN", topic: "design-system", level: "BLOCK", title: "Linked to the FSD", text: "Every FSD screen links to its design; every design links back to its FSD screen ID." , when: { platforms: UI } },

  // ---------------- Infrastructure ----------------
  { id: "INF-G01", vertical: "INFRASTRUCTURE", topic: "infra-env", level: "NON_WAIVABLE", title: "Separate environments", text: "Development, test and production are separate; production data is never copied to lower environments unmasked." },
  { id: "INF-G02", vertical: "INFRASTRUCTURE", topic: "infra-env", level: "BLOCK", title: "Guardrail check in CI", text: "Protected branches require the Krama guardrail check, build, tests and security scans to pass." },
  { id: "INF-G03", vertical: "INFRASTRUCTURE", topic: "infra-data", level: "BLOCK", title: "Backups and recovery", text: "Encrypted backups with restore tested every quarter against the agreed RTO and RPO." },

  // ---------------- Testing ----------------
  { id: "TST-G01", vertical: "TESTING", topic: "test-functional", level: "BLOCK", title: "Traced test cases", text: "Every test case traces to a BRD or FSD ID." },
  { id: "TST-G02", vertical: "TESTING", topic: "test-functional", level: "BLOCK", title: "Negative paths", text: "Each journey has test cases for rejection, cancellation, duplicates and loss of connection." },
  { id: "TST-G03", vertical: "TESTING", topic: "test-api", level: "BLOCK", title: "Contract and auth tests", text: "APIs are tested against their contract, for each role, with invalid and boundary inputs.", when: { platforms: ["API", "Integration"] } },
  { id: "TST-G04", vertical: "TESTING", topic: "test-security", level: "BLOCK", title: "Security test cases", text: "Each OWASP and domain rule in the pack has at least one test case." },
  { id: "TST-G05", vertical: "TESTING", topic: "test-accessibility", level: "BLOCK", title: "Manual accessibility pass", text: "Automated scan plus keyboard-only and screen reader passes on every changed screen.", when: { flags: ["accessibility", "government"] } },
  { id: "TST-G06", vertical: "TESTING", topic: "test-mobile", level: "BLOCK", title: "Device coverage", text: "Test on the agreed device and OS matrix, including the oldest supported version.", when: { platforms: MOBILE } },
];

export interface BlueprintSection {
  heading: string;
  items: string[];
}
export interface Blueprint {
  vertical: Vertical;
  title: string;
  sections: BlueprintSection[];
}

/** Ways of working per vertical. Downloaded separately from guardrails (BRD-DOM-05). */
export const BLUEPRINTS: Blueprint[] = [
  {
    vertical: "TECHNOLOGY",
    title: "Technology blueprint",
    sections: [
      { heading: "Repository", items: ["One repository per deployable; main is protected", "Branches: feature/<ticket>, fix/<ticket>; pull requests only", "README with run, test and environment steps"] },
      { heading: "Working with AI coding agents", items: ["Load the Krama rules pack (AGENTS.md) into the agent before generating code", "Generate in small steps; review every diff", "Never paste client personal data into a prompt"] },
      { heading: "Code review", items: ["One reviewer for normal changes, two for security-sensitive code", "Guardrail check, build and tests must pass before review"] },
      { heading: "Decisions", items: ["Record architecture decisions as ADRs in the repository", "Exceptions to a guardrail go through Krama with an expiry"] },
    ],
  },
  {
    vertical: "BA",
    title: "Business Analysis blueprint",
    sections: [
      { heading: "Intake", items: ["Intake form, SOW, MOMs and client documents", "Tag every document; mask personal data before AI"] },
      { heading: "BRD format (20 sections)", items: ["Document control; context and goals; scope; stakeholders; actors and tenancy", "Current and future process; user journeys with negative paths", "Business and functional requirements with Given / When / Then; business rules", "Entity lifecycles; NFRs; governance; constraints; data and migration; integrations", "Assumptions and risks; open questions; glossary; exceptions"] },
      { heading: "Lenses while drafting", items: ["L1 scope and cost traps", "L2 actors and tenancy", "L3 negative journeys", "L4 governance", "L5 data migration and volumes", "L6 pragmatic defaults"] },
      { heading: "Approval", items: ["Deep Audit at submission; BA Lead approves", "Krama checks client sign-off before the FSD starts"] },
    ],
  },
  {
    vertical: "DESIGN",
    title: "Design blueprint",
    sections: [
      { heading: "Stages", items: ["Flows, wireframes, visual design, prototype, accessibility review, hand-off, design QA"] },
      { heading: "Hand-off definition of ready", items: ["Every state designed", "Tokens only", "Linked to FSD screen IDs", "Accessibility notes on each screen"] },
    ],
  },
  {
    vertical: "INFRASTRUCTURE",
    title: "Infrastructure blueprint",
    sections: [
      { heading: "Environments", items: ["Dev, test, UAT and production, separated", "Infrastructure as code; no manual changes in production"] },
      { heading: "Pipelines", items: ["Build, guardrail check, tests, SAST, dependency and secrets scans on every pull request", "Signed, versioned artefacts"] },
      { heading: "Operations", items: ["Logs and metrics centralised", "Backups encrypted and restore-tested", "Incident runbook with client contacts"] },
    ],
  },
  {
    vertical: "TESTING",
    title: "Testing blueprint",
    sections: [
      { heading: "Flow", items: ["Generate test cases from the approved documents", "Optional happy flow, then Round 1, Round 2 and further rounds", "Internal QC sign-off before the build goes to the client"] },
      { heading: "Types", items: ["Functional, regression, API, security, accessibility, performance, mobile device"] },
      { heading: "Defects", items: ["Logged in the separate defect tool; each round links to its list"] },
    ],
  },
];

export interface PackContext {
  domain: Domain;
  entityType?: EntityType | null;
  platforms: string[];
  stackTopics: string[];
  flags: ProjectFlag[];
}

export function ruleApplies(rule: CatalogRule, ctx: PackContext): boolean {
  const w = rule.when;
  if (!w) return true;
  if (w.domains && !w.domains.includes(ctx.domain)) return false;
  if (w.entityTypes && (!ctx.entityType || !w.entityTypes.includes(ctx.entityType))) return false;
  if (w.platforms && !w.platforms.some((p) => ctx.platforms.includes(p))) return false;
  if (w.stackTopics && !w.stackTopics.some((t) => ctx.stackTopics.includes(t))) return false;
  if (w.flags && !w.flags.some((f) => ctx.flags.includes(f))) return false;
  return true;
}

export function composeRules(ctx: PackContext, vertical?: Vertical, from: CatalogRule[] = CATALOG): CatalogRule[] {
  return from.filter((r) => (!vertical || r.vertical === vertical) && ruleApplies(r, ctx));
}

/** Who may edit and publish each vertical's master guardrails. The Tech Architect governs every vertical. */
export const VERTICAL_OWNERS: Record<Vertical, readonly Role[]> = {
  TECHNOLOGY: ["TechArchitect"],
  INFRASTRUCTURE: ["TechArchitect", "InfraLead"],
  BA: ["TechArchitect", "BALead"],
  DESIGN: ["TechArchitect", "UIUXLead"],
  TESTING: ["TechArchitect", "LeadTester"],
};
export function canManageVertical(roles: readonly Role[], vertical: Vertical): boolean {
  return roles.some((r) => VERTICAL_OWNERS[vertical].includes(r));
}
/** Prefix for rule ids added in Krama (built-in ids are kept). */
export const NEW_RULE_PREFIX: Record<Vertical, string> = { TECHNOLOGY: "TEC", INFRASTRUCTURE: "INF", BA: "BA", DESIGN: "DES", TESTING: "TST" };

export function regulationsFor(rules: CatalogRule[]): Regulation[] {
  const ids = new Set(rules.flatMap((r) => r.sources ?? []));
  return REGULATIONS.filter((r) => ids.has(r.id));
}
