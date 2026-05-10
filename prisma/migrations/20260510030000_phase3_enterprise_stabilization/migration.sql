CREATE TABLE "FailedJob" (
  "id" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_RETRY',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextRetryAt" TIMESTAMP(3),
  "lastError" TEXT,
  "metadata" JSONB,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "FailedJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeadLetterWebhook" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT,
  "eventType" TEXT,
  "signature" TEXT,
  "nonce" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_REPLAY',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastError" TEXT,
  "payload" JSONB NOT NULL,
  "correlationId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "DeadLetterWebhook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationAudit" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "scope" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "expectedValue" DECIMAL(65,30),
  "actualValue" DECIMAL(65,30),
  "deltaValue" DECIMAL(65,30),
  "txSignature" TEXT,
  "metadata" JSONB,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ReconciliationAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeadLetterWebhook_provider_externalId_key" ON "DeadLetterWebhook"("provider", "externalId");
CREATE INDEX "FailedJob_jobType_idx" ON "FailedJob"("jobType");
CREATE INDEX "FailedJob_status_idx" ON "FailedJob"("status");
CREATE INDEX "FailedJob_nextRetryAt_idx" ON "FailedJob"("nextRetryAt");
CREATE INDEX "FailedJob_entityType_entityId_idx" ON "FailedJob"("entityType", "entityId");
CREATE INDEX "DeadLetterWebhook_provider_idx" ON "DeadLetterWebhook"("provider");
CREATE INDEX "DeadLetterWebhook_status_idx" ON "DeadLetterWebhook"("status");
CREATE INDEX "DeadLetterWebhook_nextRetryAt_idx" ON "DeadLetterWebhook"("nextRetryAt");
CREATE INDEX "DeadLetterWebhook_receivedAt_idx" ON "DeadLetterWebhook"("receivedAt");
CREATE INDEX "ReconciliationAudit_companyId_idx" ON "ReconciliationAudit"("companyId");
CREATE INDEX "ReconciliationAudit_scope_idx" ON "ReconciliationAudit"("scope");
CREATE INDEX "ReconciliationAudit_severity_idx" ON "ReconciliationAudit"("severity");
CREATE INDEX "ReconciliationAudit_status_idx" ON "ReconciliationAudit"("status");
CREATE INDEX "ReconciliationAudit_createdAt_idx" ON "ReconciliationAudit"("createdAt");
CREATE INDEX "ReconciliationAudit_entityType_entityId_idx" ON "ReconciliationAudit"("entityType", "entityId");
