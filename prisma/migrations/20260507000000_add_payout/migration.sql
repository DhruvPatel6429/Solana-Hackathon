CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "contractorWallet" TEXT NOT NULL,
    "amountUsdc" DOUBLE PRECISION NOT NULL,
    "txSignature" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payout_invoiceId_key" ON "Payout"("invoiceId");
CREATE INDEX "Payout_status_idx" ON "Payout"("status");
CREATE INDEX "Payout_contractorWallet_idx" ON "Payout"("contractorWallet");
