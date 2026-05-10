-- Phase 5 enterprise launch readiness schema extensions

DO $$ BEGIN
  CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrganizationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCE', 'COMPLIANCE', 'VIEWER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "feeWalletAddress" TEXT;
ALTER TABLE "CompanyUser" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "CompanyUser" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "WebhookEvent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "WebhookEvent" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "BillingEvent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "TreasuryTransaction" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "FailedJob" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "FailedJob" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "DeadLetterWebhook" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "DeadLetterWebhook" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "ReconciliationAudit" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE TABLE IF NOT EXISTS "OrganizationMember" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "OrganizationMemberRole" NOT NULL DEFAULT 'ADMIN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL UNIQUE,
  "scopes" JSONB NOT NULL,
  "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ApiKey_organizationId_status_idx" ON "ApiKey"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "ApiKey_companyId_idx" ON "ApiKey"("companyId");

CREATE TABLE IF NOT EXISTS "PartnerIntegration" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT,
  "partnerName" TEXT NOT NULL,
  "partnerReference" TEXT,
  "embeddingEnabled" BOOLEAN NOT NULL DEFAULT false,
  "brandedConfiguration" JSONB,
  "payoutApiEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerIntegration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartnerIntegration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PartnerIntegration_organizationId_idx" ON "PartnerIntegration"("organizationId");
CREATE INDEX IF NOT EXISTS "PartnerIntegration_companyId_idx" ON "PartnerIntegration"("companyId");

CREATE TABLE IF NOT EXISTS "PartnerWebhookSubscription" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT,
  "partnerIntegrationId" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "eventTypes" JSONB NOT NULL,
  "secretHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerWebhookSubscription_partnerIntegrationId_fkey" FOREIGN KEY ("partnerIntegrationId") REFERENCES "PartnerIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PartnerWebhookSubscription_organizationId_idx" ON "PartnerWebhookSubscription"("organizationId");
CREATE INDEX IF NOT EXISTS "PartnerWebhookSubscription_companyId_idx" ON "PartnerWebhookSubscription"("companyId");
CREATE INDEX IF NOT EXISTS "PartnerWebhookSubscription_partnerIntegrationId_idx" ON "PartnerWebhookSubscription"("partnerIntegrationId");

CREATE TABLE IF NOT EXISTS "ComplianceAlert" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT,
  "scope" TEXT NOT NULL,
  "severity" "ComplianceSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "ComplianceStatus" NOT NULL DEFAULT 'OPEN',
  "entityType" TEXT,
  "entityId" TEXT,
  "thresholdRule" TEXT,
  "amountUsdc" DECIMAL(65,30),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ComplianceAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ComplianceAlert_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ComplianceAlert_organizationId_status_idx" ON "ComplianceAlert"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "ComplianceAlert_companyId_idx" ON "ComplianceAlert"("companyId");
CREATE INDEX IF NOT EXISTS "ComplianceAlert_severity_idx" ON "ComplianceAlert"("severity");

CREATE TABLE IF NOT EXISTS "GovernancePolicy" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT,
  "policyType" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernancePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GovernancePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "GovernancePolicy_organizationId_policyType_idx" ON "GovernancePolicy"("organizationId", "policyType");
CREATE INDEX IF NOT EXISTS "GovernancePolicy_companyId_idx" ON "GovernancePolicy"("companyId");

CREATE TABLE IF NOT EXISTS "DisasterRecoverySnapshot" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "companyId" TEXT,
  "snapshotType" TEXT NOT NULL,
  "reference" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisasterRecoverySnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DisasterRecoverySnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DisasterRecoverySnapshot_organizationId_snapshotType_idx" ON "DisasterRecoverySnapshot"("organizationId", "snapshotType");
CREATE INDEX IF NOT EXISTS "DisasterRecoverySnapshot_companyId_idx" ON "DisasterRecoverySnapshot"("companyId");

CREATE INDEX IF NOT EXISTS "Company_organizationId_idx" ON "Company"("organizationId");
CREATE INDEX IF NOT EXISTS "CompanyUser_organizationId_idx" ON "CompanyUser"("organizationId");
CREATE INDEX IF NOT EXISTS "Contractor_organizationId_idx" ON "Contractor"("organizationId");
CREATE INDEX IF NOT EXISTS "Invoice_organizationId_idx" ON "Invoice"("organizationId");
CREATE INDEX IF NOT EXISTS "Payout_organizationId_idx" ON "Payout"("organizationId");
CREATE INDEX IF NOT EXISTS "UsageEvent_organizationId_idx" ON "UsageEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_organizationId_idx" ON "WebhookEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_companyId_idx" ON "WebhookEvent"("companyId");
CREATE INDEX IF NOT EXISTS "BillingEvent_organizationId_idx" ON "BillingEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "TreasuryTransaction_organizationId_idx" ON "TreasuryTransaction"("organizationId");
CREATE INDEX IF NOT EXISTS "FailedJob_organizationId_idx" ON "FailedJob"("organizationId");
CREATE INDEX IF NOT EXISTS "FailedJob_companyId_idx" ON "FailedJob"("companyId");
CREATE INDEX IF NOT EXISTS "DeadLetterWebhook_organizationId_idx" ON "DeadLetterWebhook"("organizationId");
CREATE INDEX IF NOT EXISTS "DeadLetterWebhook_companyId_idx" ON "DeadLetterWebhook"("companyId");
CREATE INDEX IF NOT EXISTS "ReconciliationAudit_organizationId_idx" ON "ReconciliationAudit"("organizationId");

ALTER TABLE "Company"
  ADD CONSTRAINT IF NOT EXISTS "Company_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
