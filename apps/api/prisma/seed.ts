/**
 * Seed: demo tenant, one user per role, default guardrail set, capability registry,
 * a fresh sample project (INPUTS phase) and a ready-to-build project (BUILD phase)
 * so `krama pull` works immediately. Idempotent: safe to run repeatedly.
 */
import { PrismaClient, type Role } from "@prisma/client";
import { DEFAULT_GUARDRAILS } from "@krama/shared";

const prisma = new PrismaClient();
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "idealake";

const USERS: { email: string; name: string; roles: Role[] }[] = [
  { email: "ba@idealake.local", name: "Ravi (BA)", roles: ["BA"] },
  { email: "dev@idealake.local", name: "Dev Developer", roles: ["Developer"] },
  { email: "architect@idealake.local", name: "Meera (Lead Architect)", roles: ["LeadArchitect"] },
  { email: "approver@idealake.local", name: "Anil (Approver)", roles: ["Approver"] },
  { email: "admin@idealake.local", name: "Platform Admin", roles: ["Admin"] },
  { email: "challenger@idealake.local", name: "Chandra (Challenger)", roles: ["Challenger"] },
];

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    create: { slug: TENANT_SLUG, name: "Idealake (demo)", entraTenantId: process.env.ENTRA_TENANT_ID || null },
    update: {},
  });

  const users: Record<string, string> = {};
  for (const u of USERS) {
    const row = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      create: { tenantId: tenant.id, ...u },
      update: { name: u.name, roles: u.roles },
    });
    users[u.email] = row.id;
  }
  const architect = users["architect@idealake.local"]!;
  const ba = users["ba@idealake.local"]!;

  if (!(await prisma.guardrailRuleSet.findFirst({ where: { tenantId: tenant.id } }))) {
    await prisma.guardrailRuleSet.create({
      data: {
        tenantId: tenant.id,
        name: DEFAULT_GUARDRAILS.name,
        version: 1,
        isActive: true,
        changeNote: "Initial default guardrails (seed)",
        createdById: architect,
        rules: {
          create: DEFAULT_GUARDRAILS.rules.map((r) => ({
            tenantId: tenant.id,
            key: r.id,
            name: r.name,
            type: r.type,
            level: r.level,
            nonWaivable: r.nonWaivable,
            appliesTo: r.appliesTo,
            params: r.params as object,
            description: r.description,
          })),
        },
      },
    });
  }

  const capabilities = [
    { name: "documentation", version: "0.1.0", kind: "AGENT" as const, status: "ACTIVE" as const, description: "Structures requirements with citations, gap report, drafts BRD/SOW/FSD", inputs: ["source-items"], outputs: ["requirements", "gaps", "documents"], permissions: ["model:sonnet", "model:haiku", "read:sources"], evalScore: null },
    { name: "execution-wizard", version: "0.1.0", kind: "TOOL" as const, status: "ACTIVE" as const, description: "Context pack + local CLI codegen with approved tools", inputs: ["approved-requirements", "adr", "guardrails"], outputs: ["context-pack"], permissions: ["read:requirements"], evalScore: null },
    { name: "guardrail-checker", version: "0.1.0", kind: "TOOL" as const, status: "ACTIVE" as const, description: "Server-side guardrail check (GitHub required status)", inputs: ["repository", "guardrails", "exceptions"], outputs: ["check-report"], permissions: ["read:repo"], evalScore: null },
    { name: "kshana", version: "0.0.0", kind: "PRODUCT" as const, status: "DRAFT" as const, description: "Future plugin — not in Phase 1", inputs: [], outputs: [], permissions: [], evalScore: null },
  ];
  for (const c of capabilities) {
    await prisma.capability.upsert({
      where: { tenantId_name_version: { tenantId: tenant.id, name: c.name, version: c.version } },
      create: { tenantId: tenant.id, ...c },
      update: {},
    });
  }

  // Sample project at the start of the flow.
  if (!(await prisma.project.findFirst({ where: { tenantId: tenant.id, name: "Claims Portal (sample)" } }))) {
    const p = await prisma.project.create({
      data: {
        tenantId: tenant.id,
        name: "Claims Portal (sample)",
        description: "Insurance claims portal for a client. Import the iDhi meetings or upload BA notes, then run Documentation.",
        clientWork: true,
        clientName: "Demo Insurance Ltd",
        projectType: "web-app",
        technology: "typescript-node",
        depthMode: "GUIDED",
        targetPlatforms: ["web"],
        approvedTools: ["claude", "copilot"],
        createdById: ba,
      },
    });
    await prisma.sourceItem.create({
      data: {
        tenantId: tenant.id,
        projectId: p.id,
        kind: "UPLOAD",
        title: "ba-notes.md",
        mimeType: "text/markdown",
        text: "# BA notes\n- Claimants must be able to track claim status online.\n- The system shall notify officers when a claim is idle for 3 days.\n",
        createdById: ba,
      },
    });
  }

  // Project already through both gates, so the CLI can pull a context pack right away.
  if (!(await prisma.project.findFirst({ where: { tenantId: tenant.id, name: "Leave Tracker (ready to build)" } }))) {
    const p = await prisma.project.create({
      data: {
        tenantId: tenant.id,
        name: "Leave Tracker (ready to build)",
        description: "Internal tool; requirements and documents already approved.",
        projectType: "web-app",
        technology: "typescript-node",
        depthMode: "GOVERNED",
        targetPlatforms: ["web"],
        approvedTools: ["claude", "codex"],
        phase: "BUILD",
        createdById: ba,
      },
    });
    const src = await prisma.sourceItem.create({
      data: {
        tenantId: tenant.id,
        projectId: p.id,
        kind: "UPLOAD",
        title: "leave-policy-notes.md",
        mimeType: "text/markdown",
        text: "Employees must be able to apply for leave.\nManagers must approve or reject leave requests.\nHR should see a monthly leave report.",
        createdById: ba,
      },
    });
    const reqs = [
      ["REQ-001", "Apply for leave", "Employees must be able to apply for leave.", "FUNCTIONAL", "MUST", 1],
      ["REQ-002", "Approve leave", "Managers must approve or reject leave requests.", "FUNCTIONAL", "MUST", 2],
      ["REQ-003", "Monthly report", "HR should see a monthly leave report.", "FUNCTIONAL", "SHOULD", 3],
    ] as const;
    for (const [code, title, description, type, priority, line] of reqs) {
      await prisma.requirement.create({
        data: {
          tenantId: tenant.id,
          projectId: p.id,
          code,
          title,
          description,
          type,
          priority,
          status: "APPROVED",
          citations: [{ sourceItemId: src.id, quote: description, location: `line ${line}` }],
        },
      });
    }
    await prisma.decision.create({
      data: {
        tenantId: tenant.id,
        projectId: p.id,
        number: 1,
        title: "NestJS + PostgreSQL service with Next.js front end",
        context: "Internal tool, small team, Idealake TypeScript blueprint.",
        decision: "Use the Idealake typescript-node blueprint (NestJS API, Next.js web, PostgreSQL).",
        consequences: "Standard CI, guardrails and deployment templates apply.",
        status: "ACCEPTED",
        createdById: architect,
      },
    });
  }

  await prisma.auditLog.create({
    data: { tenantId: tenant.id, actorType: "system", action: "seed.applied", entityType: "tenant", entityId: tenant.id },
  });
  console.log(`Seeded tenant "${TENANT_SLUG}" with ${USERS.length} users. Dev logins: ${USERS.map((u) => u.email).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
