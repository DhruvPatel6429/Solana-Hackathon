-- Phase 2 production hardening: durable webhook, billing, and treasury state.

ALTER TABLE "Company"
ADD COLUMN "treasuryBalanceUsdc" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "treasuryBalanceUpdatedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "WebhookEvent_source_eventId_key";
DROP INDEX IF EXISTS "WebhookEvent_source_idx";

ALTER TABLE "WebhookEvent"
RENAME COLUMN "source" TO "provider";

ALTER TABLE "WebhookEvent"
RENAME COLUMN "eventId" TO "externalId";

ALTER TABLE "WebhookEvent"
ADD COLUMN "eventType" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "signature" TEXT,
ADD COLUMN "processed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "WebhookEvent"
ALTER COLUMN "processedAt" DROP NOT NULL;

CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent"("provider", "externalId");
CREATE INDEX "WebhookEvent_provider_idx" ON "WebhookEvent"("provider");
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");
CREATE INDEX "WebhookEvent_processed_idx" ON "WebhookEvent"("processed");

CREATE TABLE "BillingEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "dodoPaymentId" TEXT NOT NULL,
  "customerEmail" TEXT,
  "amountUsd" DECIMAL(65,30) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "rawPayload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingEvent_dodoPaymentId_key" ON "BillingEvent"("dodoPaymentId");
CREATE INDEX "BillingEvent_companyId_idx" ON "BillingEvent"("companyId");
CREATE INDEX "BillingEvent_status_idx" ON "BillingEvent"("status");
CREATE INDEX "BillingEvent_createdAt_idx" ON "BillingEvent"("createdAt");

ALTER TABLE "BillingEvent"
ADD CONSTRAINT "BillingEvent_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TreasuryTransaction" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "signature" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "amountUsdc" DECIMAL(65,30) NOT NULL,
  "direction" TEXT NOT NULL,
  "source" TEXT,
  "destination" TEXT,
  "slot" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TreasuryTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreasuryTransaction_signature_key" ON "TreasuryTransaction"("signature");
CREATE INDEX "TreasuryTransaction_companyId_idx" ON "TreasuryTransaction"("companyId");
CREATE INDEX "TreasuryTransaction_walletAddress_idx" ON "TreasuryTransaction"("walletAddress");
CREATE INDEX "TreasuryTransaction_direction_idx" ON "TreasuryTransaction"("direction");
CREATE INDEX "TreasuryTransaction_createdAt_idx" ON "TreasuryTransaction"("createdAt");

ALTER TABLE "TreasuryTransaction"
ADD CONSTRAINT "TreasuryTransaction_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
