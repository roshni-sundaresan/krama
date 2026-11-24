-- CreateEnum
CREATE TYPE "GuardrailVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'DISCARDED');

-- CreateTable
CREATE TABLE "GuardrailVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "GuardrailVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "rules" JSONB NOT NULL,
    "changeNote" TEXT NOT NULL,
    "documentKey" TEXT,
    "documentName" TEXT,
    "documentType" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardrailVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuardrailVersion_tenantId_vertical_status_idx" ON "GuardrailVersion"("tenantId", "vertical", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GuardrailVersion_tenantId_vertical_version_key" ON "GuardrailVersion"("tenantId", "vertical", "version");

