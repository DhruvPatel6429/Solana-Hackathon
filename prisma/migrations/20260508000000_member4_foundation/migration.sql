CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planTier" TEXT,
    "dodoCustomerId" TEXT,
    "dodoSubscriptionId" TEXT,
    "treasuryWalletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyUser" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "taxId" TEXT,
    "payoutPreference" TEXT NOT NULL DEFAULT 'USDC',
    "walletAddress" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "amountUsdc" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invoiceHash" TEXT,
    "description" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "dodoEventId" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payout" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Payout" ADD COLUMN "contractorId" TEXT;
ALTER TABLE "Payout" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USDC';

CREATE UNIQUE INDEX "CompanyUser_userId_key" ON "CompanyUser"("userId");
CREATE INDEX "CompanyUser_companyId_idx" ON "CompanyUser"("companyId");

CREATE INDEX "Contractor_companyId_idx" ON "Contractor"("companyId");
CREATE INDEX "Contractor_kycStatus_idx" ON "Contractor"("kycStatus");

CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");
CREATE INDEX "Invoice_contractorId_idx" ON "Invoice"("contractorId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

CREATE INDEX "Payout_companyId_idx" ON "Payout"("companyId");
CREATE INDEX "Payout_contractorId_idx" ON "Payout"("contractorId");
CREATE INDEX "Payout_companyId_status_idx" ON "Payout"("companyId", "status");
CREATE INDEX "Payout_companyId_createdAt_idx" ON "Payout"("companyId", "createdAt");

CREATE INDEX "UsageEvent_companyId_idx" ON "UsageEvent"("companyId");
CREATE INDEX "UsageEvent_eventType_idx" ON "UsageEvent"("eventType");

CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

CREATE UNIQUE INDEX "WebhookEvent_source_eventId_key" ON "WebhookEvent"("source", "eventId");
CREATE INDEX "WebhookEvent_source_idx" ON "WebhookEvent"("source");
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

ALTER TABLE "CompanyUser"
ADD CONSTRAINT "CompanyUser_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Contractor"
ADD CONSTRAINT "Contractor_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_contractorId_fkey"
FOREIGN KEY ("contractorId")
REFERENCES "Contractor"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "Payout"
ADD CONSTRAINT "Payout_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Payout"
ADD CONSTRAINT "Payout_contractorId_fkey"
FOREIGN KEY ("contractorId")
REFERENCES "Contractor"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "UsageEvent"
ADD CONSTRAINT "UsageEvent_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
