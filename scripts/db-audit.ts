import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

const [missingPayoutIndexes, negativeInvoices, negativePayouts, duplicateSignatures] = await Promise.all([
  Promise.resolve([
    "Payout_companyId_status_idx",
    "Payout_companyId_createdAt_idx",
    "WebhookEvent_provider_externalId_key",
    "TreasuryTransaction_signature_key",
    "ReconciliationAudit_status_idx",
  ]),
  db.invoice.count({ where: { amountUsdc: { lte: 0 } } }),
  db.payout.count({ where: { amountUsdc: { lte: 0 } } }),
  db.payout.findMany({
    where: { txSignature: { not: null } },
    select: { txSignature: true },
    take: 5000,
  }),
]);

const signatureCounts = new Map<string, number>();
for (const row of duplicateSignatures) {
  signatureCounts.set(row.txSignature, (signatureCounts.get(row.txSignature) ?? 0) + 1);
}

const duplicateTx = [...signatureCounts.entries()].filter(([, count]) => count > 1);

console.info(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      decimalConsistency: {
        negativeInvoices,
        negativePayouts,
      },
      indexReview: {
        expectedHotPathIndexes: missingPayoutIndexes,
      },
      duplicateTransactionSignatures: duplicateTx,
    },
    null,
    2,
  ),
);
