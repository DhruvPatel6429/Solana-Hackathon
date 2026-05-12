-- Persist Dodo checkout return state so onboarding can sync after hosted checkout redirects.

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "dodoCheckoutSessionId" TEXT,
ADD COLUMN IF NOT EXISTS "dodoPaymentId" TEXT;

CREATE INDEX IF NOT EXISTS "Company_dodoCheckoutSessionId_idx" ON "Company"("dodoCheckoutSessionId");
CREATE INDEX IF NOT EXISTS "Company_dodoPaymentId_idx" ON "Company"("dodoPaymentId");
