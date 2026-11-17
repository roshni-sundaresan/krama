-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SuperAdmin', 'TechArchitect', 'BALead', 'BA', 'UIUXLead', 'Designer', 'Developer', 'LeadTester', 'Tester', 'InfraLead');

-- CreateEnum
CREATE TYPE "Domain" AS ENUM ('BFSI', 'MUTUAL_FUNDS', 'GENERAL');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('COMMERCIAL_BANK', 'NBFC_OTHER_BANK', 'PAYMENT_OPERATOR', 'INSURER', 'AMC', 'OTHER');

-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('INTAKE', 'BRD', 'CLIENT_SIGNOFF', 'FSD', 'DESIGN', 'API_SPEC', 'STACK', 'DEVELOPMENT', 'TESTING');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('UPLOAD', 'IDHI_MEETING');

-- CreateEnum
CREATE TYPE "DocTag" AS ENUM ('SOW', 'MOM', 'PROCESS', 'POLICY', 'DESIGN', 'API_DOC', 'EXISTING_SYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('FUNCTIONAL', 'NON_FUNCTIONAL', 'CONSTRAINT');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('MUST', 'SHOULD', 'COULD');

-- CreateEnum
CREATE TYPE "Lens" AS ENUM ('L1', 'L2', 'L3', 'L4', 'L5', 'L6');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'ANSWERED', 'DEFAULT_ACCEPTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BRD', 'FSD', 'API_SPEC');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFTING', 'DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'CLIENT_SIGNED_OFF', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('READY_FOR_FSD', 'NEEDS_CLARIFICATION', 'BLOCKED_HIGH_RISK');

-- CreateEnum
CREATE TYPE "PackStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CapabilityKind" AS ENUM ('AGENT', 'TOOL', 'PRODUCT');

-- CreateEnum
CREATE TYPE "CapabilityStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entraTenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "Role"[],
    "entraObjectId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "description" TEXT,
    "domain" "Domain" NOT NULL,
    "entityType" "EntityType",
    "domainConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "domainConfirmedById" TEXT,
    "platforms" TEXT[],
    "government" BOOLEAN NOT NULL DEFAULT false,
    "existingProduction" BOOLEAN NOT NULL DEFAULT false,
    "accessibilityRequired" BOOLEAN NOT NULL DEFAULT false,
    "sowReference" TEXT,
    "clientSignoffOwner" TEXT NOT NULL,
    "regulations" TEXT,
    "integrations" TEXT,
    "phase" "Phase" NOT NULL DEFAULT 'INTAKE',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "stackKey" TEXT,
    "stackRationale" TEXT,
    "stackSelectedById" TEXT,
    "stackSelectedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storageKey" TEXT,
    "externalRef" TEXT,
    "docType" "DocTag",
    "version" TEXT,
    "docDate" TEXT,
    "provider" TEXT,
    "personalData" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT,
    "maskedText" TEXT,
    "piiFindings" JSONB NOT NULL DEFAULT '[]',
    "injectionFlags" JSONB NOT NULL DEFAULT '[]',
    "maskingConfirmedById" TEXT,
    "maskingConfirmedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceChunk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "RequirementType" NOT NULL,
    "priority" "Priority" NOT NULL,
    "citations" JSONB NOT NULL,
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "aiDrafted" BOOLEAN NOT NULL DEFAULT true,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LensFinding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "code" TEXT NOT NULL,
    "lens" "Lens" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "question" TEXT NOT NULL,
    "proposedDefault" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "relatedRequirementCodes" TEXT[],
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LensFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFTING',
    "content" JSONB NOT NULL DEFAULT '{}',
    "generation" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeepAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersion" INTEGER NOT NULL,
    "status" "AuditStatus" NOT NULL,
    "criticalCount" INTEGER NOT NULL,
    "ruleFindings" JSONB NOT NULL,
    "aiReport" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeepAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientSignoff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signedByName" TEXT NOT NULL,
    "signedByEmail" TEXT NOT NULL,
    "signedOn" TEXT NOT NULL,
    "note" TEXT,
    "evidenceKey" TEXT,
    "evidenceName" TEXT,
    "recordedById" TEXT NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSignoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "consequences" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardrailPack" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PackStatus" NOT NULL DEFAULT 'SUBMITTED',
    "domain" "Domain" NOT NULL,
    "entityType" "EntityType",
    "stackKey" TEXT NOT NULL,
    "flags" TEXT[],
    "content" JSONB NOT NULL,
    "generatedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardrailPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistConfirmation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packVersion" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "packVersion" INTEGER NOT NULL,
    "status" "CheckStatus" NOT NULL DEFAULT 'RUNNING',
    "passed" BOOLEAN,
    "blocking" INTEGER NOT NULL DEFAULT 0,
    "warnings" INTEGER NOT NULL DEFAULT 0,
    "filesScanned" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardrailException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "compensatingControl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardrailException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowType" TEXT NOT NULL,
    "temporalWorkflowId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "stage" TEXT NOT NULL DEFAULT 'STARTING',
    "input" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "kind" "CapabilityKind" NOT NULL,
    "status" "CapabilityStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "inputs" TEXT[],
    "outputs" TEXT[],
    "permissions" TEXT[],
    "evalScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "projectId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "runId" TEXT,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(12,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_entraTenantId_key" ON "Tenant"("entraTenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "ProjectMember_tenantId_userId_idx" ON "ProjectMember"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_tenantId_code_key" ON "Project"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SourceItem_tenantId_projectId_idx" ON "SourceItem"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "SourceChunk_tenantId_idx" ON "SourceChunk"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceChunk_sourceItemId_ordinal_key" ON "SourceChunk"("sourceItemId", "ordinal");

-- CreateIndex
CREATE INDEX "Requirement_tenantId_projectId_idx" ON "Requirement"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "LensFinding_tenantId_projectId_idx" ON "LensFinding"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Document_tenantId_projectId_idx" ON "Document"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_projectId_type_version_key" ON "Document"("projectId", "type", "version");

-- CreateIndex
CREATE INDEX "DeepAudit_tenantId_projectId_idx" ON "DeepAudit"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "ClientSignoff_tenantId_projectId_idx" ON "ClientSignoff"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Decision_tenantId_idx" ON "Decision"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_projectId_number_key" ON "Decision"("projectId", "number");

-- CreateIndex
CREATE INDEX "GuardrailPack_tenantId_projectId_idx" ON "GuardrailPack"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardrailPack_projectId_version_key" ON "GuardrailPack"("projectId", "version");

-- CreateIndex
CREATE INDEX "ChecklistConfirmation_tenantId_projectId_idx" ON "ChecklistConfirmation"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistConfirmation_projectId_userId_packVersion_key" ON "ChecklistConfirmation"("projectId", "userId", "packVersion");

-- CreateIndex
CREATE INDEX "ProjectCheck_tenantId_projectId_idx" ON "ProjectCheck"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "GuardrailException_tenantId_projectId_status_idx" ON "GuardrailException"("tenantId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_temporalWorkflowId_key" ON "WorkflowRun"("temporalWorkflowId");

-- CreateIndex
CREATE INDEX "WorkflowRun_tenantId_projectId_idx" ON "WorkflowRun"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Capability_tenantId_name_version_key" ON "Capability"("tenantId", "name", "version");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_projectId_idx" ON "AuditLog"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "TokenUsage_tenantId_createdAt_idx" ON "TokenUsage"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunk" ADD CONSTRAINT "SourceChunk_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensFinding" ADD CONSTRAINT "LensFinding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensFinding" ADD CONSTRAINT "LensFinding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeepAudit" ADD CONSTRAINT "DeepAudit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeepAudit" ADD CONSTRAINT "DeepAudit_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSignoff" ADD CONSTRAINT "ClientSignoff_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSignoff" ADD CONSTRAINT "ClientSignoff_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardrailPack" ADD CONSTRAINT "GuardrailPack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistConfirmation" ADD CONSTRAINT "ChecklistConfirmation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCheck" ADD CONSTRAINT "ProjectCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardrailException" ADD CONSTRAINT "GuardrailException_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Append-only audit log (BRD section 17)
CREATE OR REPLACE FUNCTION krama_audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION krama_audit_log_immutable();

CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION krama_audit_log_immutable();
