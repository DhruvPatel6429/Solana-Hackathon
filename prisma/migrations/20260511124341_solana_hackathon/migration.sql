-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayoutPreference" AS ENUM ('USDC', 'FIAT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');

-- AlterTable
ALTER TABLE "FailedJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WebhookEvent" ALTER COLUMN "externalId" DROP NOT NULL,
ALTER COLUMN "processedAt" DROP DEFAULT,
ALTER COLUMN "eventType" DROP DEFAULT,
ALTER COLUMN "processed" SET DEFAULT false;

-- AddForeignKey
ALTER TABLE "PartnerWebhookSubscription" ADD CONSTRAINT "PartnerWebhookSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
