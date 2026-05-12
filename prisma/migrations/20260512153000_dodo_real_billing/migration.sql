-- Real Dodo Payments billing state.

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "billingStatus" TEXT,
ADD COLUMN IF NOT EXISTS "billingPortalUrl" TEXT,
ADD COLUMN IF NOT EXISTS "subscriptionUpdatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "webhookLastReceivedAt" TIMESTAMP(3);

ALTER TABLE "UsageEvent"
ADD COLUMN IF NOT EXISTS "usageSyncedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastReportedUsage" JSONB;

CREATE INDEX IF NOT EXISTS "Company_billingStatus_idx" ON "Company"("billingStatus");
CREATE INDEX IF NOT EXISTS "Company_dodoCustomerId_idx" ON "Company"("dodoCustomerId");
CREATE INDEX IF NOT EXISTS "Company_dodoSubscriptionId_idx" ON "Company"("dodoSubscriptionId");
CREATE INDEX IF NOT EXISTS "UsageEvent_usageSyncedAt_idx" ON "UsageEvent"("usageSyncedAt");
