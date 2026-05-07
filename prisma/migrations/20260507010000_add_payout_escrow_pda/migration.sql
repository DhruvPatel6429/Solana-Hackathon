ALTER TABLE "Payout" ADD COLUMN "escrowPda" TEXT;

CREATE INDEX "Payout_escrowPda_idx" ON "Payout"("escrowPda");
