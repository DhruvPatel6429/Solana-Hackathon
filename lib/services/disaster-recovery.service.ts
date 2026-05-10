import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export async function storeRecoverySnapshot(input: {
  organizationId: string;
  companyId?: string | null;
  snapshotType: string;
  reference?: string;
  payload: Record<string, unknown>;
}) {
  return db.disasterRecoverySnapshot.create({
    data: {
      organizationId: input.organizationId,
      companyId: input.companyId ?? null,
      snapshotType: input.snapshotType,
      reference: input.reference,
      payload: input.payload,
    },
  });
}

export async function snapshotTreasuryState(input: {
  organizationId: string;
  companyId: string;
}) {
  const [company, treasuryTransactions] = await Promise.all([
    db.company.findUnique({
      where: { id: input.companyId },
      select: {
        id: true,
        organizationId: true,
        treasuryWalletAddress: true,
        feeWalletAddress: true,
        treasuryBalanceUsdc: true,
        treasuryBalanceUpdatedAt: true,
      },
    }),
    db.treasuryTransaction.findMany({
      where: { companyId: input.companyId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return storeRecoverySnapshot({
    organizationId: input.organizationId,
    companyId: input.companyId,
    snapshotType: "TREASURY_STATE",
    payload: {
      company,
      recentTreasuryTransactions: treasuryTransactions,
    },
  });
}

export async function snapshotWebhookState(input: {
  organizationId: string;
  companyId?: string;
}) {
  const [webhooks, deadLetter] = await Promise.all([
    db.webhookEvent.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.companyId ? { companyId: input.companyId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.deadLetterWebhook.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.companyId ? { companyId: input.companyId } : {}),
      },
      orderBy: { receivedAt: "desc" },
      take: 500,
    }),
  ]);

  return storeRecoverySnapshot({
    organizationId: input.organizationId,
    companyId: input.companyId,
    snapshotType: "WEBHOOK_STATE",
    payload: {
      webhookEvents: webhooks,
      deadLetterWebhooks: deadLetter,
    },
  });
}

export async function snapshotPayoutRecoveryState(input: {
  organizationId: string;
  companyId?: string;
}) {
  const [payouts, failedJobs, reconciliation] = await Promise.all([
    db.payout.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.companyId ? { companyId: input.companyId } : {}),
        status: { in: ["PENDING", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.failedJob.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.companyId ? { companyId: input.companyId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.reconciliationAudit.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.companyId ? { companyId: input.companyId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  return storeRecoverySnapshot({
    organizationId: input.organizationId,
    companyId: input.companyId,
    snapshotType: "PAYOUT_RECOVERY_STATE",
    payload: {
      pendingOrFailedPayouts: payouts,
      failedJobs,
      reconciliationAudits: reconciliation,
    },
  });
}
