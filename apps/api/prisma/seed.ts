/**
 * Seed: demo tenant, one user per role, capability registry and three projects that show both paths:
 *   LOP  Loan Origination Portal  — BFSI bank, at intake (BA path demo: masking, BRD drafting, audit, approval)
 *   ISA  Investor Services App    — Mutual Funds, BRD signed off, pack approved (Tech Architect and developer demo)
 *   DOB  Dealer Onboarding        — General, new project with nothing uploaded
 * Idempotent: safe to run repeatedly.
 */
import { PrismaClient, type Prisma, type Role } from "@prisma/client";
import { BLUEPRINTS, BRD_SECTIONS, composeRules, findStack, maskPersonalData, regulationsFor } from "@krama/shared";

const prisma = new PrismaClient();
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "idealake";

const USERS: { email: string; name: string; roles: Role[] }[] = [
  { email: "admin@idealake.local", name: "Kavita Iyer", roles: ["SuperAdmin"] },
  { email: "architect@idealake.local", name: "Meera Nair", roles: ["TechArchitect"] },
  { email: "balead@idealake.local", name: "Sanjay Kulkarni", roles: ["BALead"] },
  { email: "ba@idealake.local", name: "Ravi Menon", roles: ["BA"] },
  { email: "uxlead@idealake.local", name: "Tara Shah", roles: ["UIUXLead"] },
  { email: "designer@idealake.local", name: "Neha Joshi", roles: ["Designer"] },
  { email: "dev@idealake.local", name: "Arjun Rao", roles: ["Developer"] },
  { email: "dev2@idealake.local", name: "Fatima Khan", roles: ["Developer"] },
  { email: "leadtester@idealake.local", name: "Vikram Das", roles: ["LeadTester"] },
  { email: "tester@idealake.local", name: "Pooja Patil", roles: ["Tester"] },
  { email: "infra@idealake.local", name: "Imran Sheikh", roles: ["InfraLead"] },
];

const LOP_SOW = `Statement of Work — Loan Origination Portal v1.2
Scope: Idealake will build a loan origination portal for personal loans on web and mobile.
The portal must let applicants apply online, upload KYC documents and track their application.
Credit officers must review applications in a work queue.
Out of scope: loan disbursal, collections and core banking changes.
Timeline: 16 weeks from BRD sign-off.`;

const LOP_MOM = `LOP-MOM-02 Credit workflow (converted from notes)
Attendees: Asha Rao (asha.rao@clientbank.in, 98200 11223), Ravi (BA)
A credit manager must approve every loan above 5 lakh before disbursal.
The system shall keep an audit trail of every credit decision.
Managers want to export monthly approval statistics as CSV.`;

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    create: { slug: TENANT_SLUG, name: "Idealake", entraTenantId: process.env.ENTRA_TENANT_ID || null },
    update: {},
  });
  const t = tenant.id;
  const u: Record<string, string> = {};
  for (const x of USERS) {
    const row = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: t, email: x.email } },
      create: { tenantId: t, ...x },
      update: { name: x.name, roles: x.roles, active: true },
    });
    u[x.email.split("@")[0]!] = row.id;
  }

  const capabilities = [
    { name: "documentation", version: "0.2.0", kind: "AGENT" as const, status: "ACTIVE" as const, description: "Requirements with citations and Given/When/Then, lens findings, 20-section BRD", inputs: ["masked-sources"], outputs: ["requirements", "lens-findings", "brd"], permissions: ["model:sonnet", "read:masked-sources"] },
    { name: "deep-audit", version: "0.1.0", kind: "AGENT" as const, status: "ACTIVE" as const, description: "BRD Deep Audit at submission (BA blueprint Appendix A)", inputs: ["brd"], outputs: ["deep-audit-report"], permissions: ["model:opus"] },
    { name: "guardrail-packs", version: "0.1.0", kind: "TOOL" as const, status: "ACTIVE" as const, description: "Domain and stack guardrails, blueprints, rules pack and checklist", inputs: ["project", "stack"], outputs: ["pack"], permissions: [] },
    { name: "project-check", version: "0.1.0", kind: "TOOL" as const, status: "ACTIVE" as const, description: "Optional check of a linked repository or uploaded project", inputs: ["repository"], outputs: ["check-report"], permissions: ["read:repo"] },
  ];
  for (const c of capabilities) {
    await prisma.capability.upsert({ where: { tenantId_name_version: { tenantId: t, name: c.name, version: c.version } }, create: { tenantId: t, ...c }, update: {} });
  }

  const team = (ids: string[]) => ids.map((userId) => ({ tenantId: t, userId, addedById: u.architect! }));

  // ---------- LOP: BFSI bank at intake ----------
  if (!(await prisma.project.findUnique({ where: { tenantId_code: { tenantId: t, code: "LOP" } } }))) {
    const masked = maskPersonalData(LOP_MOM);
    await prisma.project.create({
      data: {
        tenantId: t, code: "LOP", name: "Loan Origination Portal", clientName: "Client A Bank", domain: "BFSI", entityType: "COMMERCIAL_BANK",
        description: "Personal loan applications on web and mobile with a credit officer work queue.",
        platforms: ["Web", "Mobile iOS", "Mobile Android", "API"], sowReference: "SOW-2026-118 v1.2",
        clientSignoffOwner: "Asha Rao, Head of Retail Lending, asha.rao@clientbank.in",
        regulations: "DPDP Act; RBI Cybersecurity Directions 2026", integrations: "Core banking (SOAP), credit bureau, SMS gateway",
        createdById: u.ba!,
        members: { create: team([u.ba!, u.balead!, u.architect!, u.dev!, u.uxlead!, u.leadtester!]) },
        sourceItems: {
          create: [
            { tenantId: t, kind: "UPLOAD", title: "LOP_SOW_LoanOrigination_v1.2.txt", mimeType: "text/plain", text: LOP_SOW, maskedText: LOP_SOW, docType: "SOW", version: "1.2", docDate: "2026-10-28", provider: "Idealake", createdById: u.ba! },
            { tenantId: t, kind: "UPLOAD", title: "LOP-MOM-02 Credit workflow.txt", mimeType: "text/plain", text: LOP_MOM, maskedText: masked.masked, piiFindings: masked.findings as unknown as Prisma.InputJsonValue, personalData: true, docType: "MOM", version: "1", docDate: "2026-11-07", provider: "Ravi Menon", createdById: u.ba! },
          ],
        },
      },
    });
  }

  // ---------- ISA: Mutual Funds, BRD signed off, pack approved ----------
  if (!(await prisma.project.findUnique({ where: { tenantId_code: { tenantId: t, code: "ISA" } } }))) {
    const p = await prisma.project.create({
      data: {
        tenantId: t, code: "ISA", name: "Investor Services App", clientName: "Client B Asset Management", domain: "MUTUAL_FUNDS", entityType: "AMC",
        domainConfirmed: true, domainConfirmedById: u.architect, description: "Investor app for SIPs, redemptions and statements.",
        platforms: ["Mobile iOS", "Mobile Android", "API"], existingProduction: true, accessibilityRequired: true, sowReference: "SOW-2026-104 v1.0",
        clientSignoffOwner: "R. Varma, Digital Head, r.varma@clientamc.in", integrations: "Registrar and transfer agent API, payment gateway",
        phase: "DEVELOPMENT", stackKey: "flutter-nest", stackRationale: "Existing app is Flutter; team has deepest Flutter experience; NestJS matches the current API.",
        stackSelectedById: u.architect, stackSelectedAt: new Date("2026-11-10T10:00:00Z"), createdById: u.ba!,
        members: { create: team([u.ba!, u.balead!, u.architect!, u.dev!, u.dev2!, u.leadtester!, u.tester!]) },
      },
    });
    const src = await prisma.sourceItem.create({
      data: { tenantId: t, projectId: p.id, kind: "UPLOAD", title: "ISA-MOM-01 Scope.txt", mimeType: "text/plain", text: "Investors must be able to start a SIP from the app. Redemptions must reach the registrar within the cut-off time.", maskedText: "Investors must be able to start a SIP from the app. Redemptions must reach the registrar within the cut-off time.", docType: "MOM", version: "1", docDate: "2026-10-20", provider: "Ravi Menon", createdById: u.ba! },
    });
    const cite = (q: string) => [{ sourceItemId: src.id, quote: q, location: "line 1" }];
    const doc = await prisma.document.create({
      data: {
        tenantId: t, projectId: p.id, type: "BRD", version: 1, status: "CLIENT_SIGNED_OFF", createdById: u.ba!, approvedById: u.balead, approvedAt: new Date("2026-11-08T09:00:00Z"), submittedAt: new Date("2026-11-07T09:00:00Z"),
        generation: { model: "stub-sonnet", provider: "stub", promptVersions: { draftBrd: "brd-20/1" } },
        content: {
          title: "BRD v1 — Investor Services App",
          sections: BRD_SECTIONS.map((h) => ({
            heading: h,
            statements: h === "Functional requirements"
              ? [{ text: "FR-001: Investors must be able to start a SIP from the app.", citations: cite("Investors must be able to start a SIP from the app."), requirementCodes: ["FR-001"], aiSuggested: false }]
              : [{ text: `${h}: confirmed with the client in the scope workshop.`, citations: [], requirementCodes: [], aiSuggested: true, confirmed: true }],
          })),
        },
      },
    });
    await prisma.requirement.createMany({
      data: [
        { tenantId: t, projectId: p.id, documentId: doc.id, code: "FR-001", title: "Start a SIP", description: "Investors must be able to start a SIP from the app.", type: "FUNCTIONAL", priority: "MUST", citations: cite("Investors must be able to start a SIP from the app."), acceptanceCriteria: [{ given: "a KYC-verified investor", when: "they choose a scheme and amount and confirm", then: "a SIP is registered and a confirmation is shown" }], confirmed: true, confirmedById: u.ba },
        { tenantId: t, projectId: p.id, documentId: doc.id, code: "CON-001", title: "Redemption cut-off", description: "Redemptions must reach the registrar within the cut-off time.", type: "CONSTRAINT", priority: "MUST", citations: cite("Redemptions must reach the registrar within the cut-off time."), confirmed: true, confirmedById: u.ba },
      ],
    });
    await prisma.deepAudit.create({ data: { tenantId: t, projectId: p.id, documentId: doc.id, documentVersion: 1, status: "READY_FOR_FSD", criticalCount: 0, ruleFindings: [], aiReport: { readiness_assessment: { status: "READY_FOR_FSD", confidence_score: 86, estimation_risk_level: "LOW", executive_summary: "Ready for FSD." }, adversarial_gap_matrix: [], sign_off_blocker_questions: [] }, createdById: u.ba! } });
    await prisma.clientSignoff.create({ data: { tenantId: t, projectId: p.id, documentId: doc.id, signedByName: "R. Varma", signedByEmail: "r.varma@clientamc.in", signedOn: "2026-11-09", note: "Signed by email", recordedById: u.ba! } });
    await prisma.decision.create({ data: { tenantId: t, projectId: p.id, number: 1, title: "Select technology stack: Flutter mobile + NestJS API", context: "Domain Mutual Funds (AMC); existing client production app.", decision: "Flutter for iOS and Android; NestJS on Node.js 22 LTS; PostgreSQL 16.", consequences: "Existing app is Flutter; team has deepest Flutter experience.", createdById: u.architect! } });
    const stack = findStack("flutter-nest")!;
    const rules = composeRules({ domain: "MUTUAL_FUNDS", entityType: "AMC", platforms: p.platforms, stackTopics: stack.topics, flags: ["existingProduction", "accessibility"] });
    await prisma.guardrailPack.create({
      data: {
        tenantId: t, projectId: p.id, version: 1, status: "APPROVED", domain: "MUTUAL_FUNDS", entityType: "AMC", stackKey: stack.key, flags: ["existingProduction", "accessibility"],
        content: { rules, blueprints: BLUEPRINTS, regulations: regulationsFor(rules), checklist: stack.checklist, stack: { key: stack.key, name: stack.name, layers: stack.layers } } as unknown as Prisma.InputJsonValue,
        generatedById: u.architect!, approvedById: u.architect, approvedAt: new Date("2026-11-11T08:00:00Z"),
      },
    });
    await prisma.checklistConfirmation.create({ data: { tenantId: t, projectId: p.id, userId: u.dev2!, packVersion: 1, items: stack.checklist.map((i) => ({ id: i.id, name: i.name, version: i.version, ticked: true })) as unknown as Prisma.InputJsonValue } });
  }

  // ---------- DOB: General, new ----------
  if (!(await prisma.project.findUnique({ where: { tenantId_code: { tenantId: t, code: "DOB" } } }))) {
    await prisma.project.create({
      data: {
        tenantId: t, code: "DOB", name: "Dealer Onboarding", clientName: "Client D Motors", domain: "GENERAL", platforms: ["Web"],
        clientSignoffOwner: "Operations Head, ops.head@clientd.in", createdById: u.ba!, members: { create: team([u.ba!, u.balead!]) },
      },
    });
  }

  console.log(`Seeded tenant "${TENANT_SLUG}". Dev logins: ${USERS.map((x) => `${x.email} (${x.roles.join(", ")})`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
