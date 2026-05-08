ALTER TABLE "Contractor"
ADD COLUMN "email" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Contractor"
ADD COLUMN "preferredFiatCurrency" TEXT;

ALTER TABLE "Invoice"
ADD COLUMN "notes" TEXT;

ALTER TABLE "Invoice"
ADD COLUMN "rejectionReason" TEXT;

ALTER TABLE "Payout"
ADD CONSTRAINT "Payout_invoiceId_fkey"
FOREIGN KEY ("invoiceId")
REFERENCES "Invoice"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
