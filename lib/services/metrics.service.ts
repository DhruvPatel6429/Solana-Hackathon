import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}

export async function getSystemMetrics(companyId?: string) {
  const payoutWhere = companyId ? { companyId } : {};
  const [totalPayouts, confirmedPayouts, failedPayouts, pendingPayouts, companies, webhooks, staleEscrows] =
    await Promise.all([
      db.payout.count({ where: payoutWhere }),
      db.payout.count({ where: { ...payoutWhere, status: "CONFIRMED" } }),
      db.payout.count({ where: { ...payoutWhere, status: { in: ["FAILED", "PERMANENT_FAILURE"] } } }),
      db.payout.count({ where: { ...payoutWhere, status: "PENDING" } }),
      db.company.findMany({
        where: companyId ? { id: companyId } : {},
        select: {
          id: true,
          name: true,
          treasuryBalanceUsdc: true,
          treasuryBalanceUpdatedAt: true,
          treasuryWalletAddress: true,
        },
        take: 100,
      }),
      db.webhookEvent.findMany({
        where: {},
        orderBy: { createdAt: "desc" },
        take: 250,
      }),
      db.payout.findMany({
        where: {
          ...payoutWhere,
          escrowPda: { not: null },
          status: { in: ["PENDING", "FAILED"] },
        },
        select: { amountUsdc: true },
        take: 500,
      }),
    ]);

  const now = Date.now();
  const webhookLatencies = webhooks
    .filter((event: any) => event.processedAt)
    .map((event: any) => event.processedAt.getTime() - event.createdAt.getTime());
  const avgWebhookLatencyMs =
    webhookLatencies.length === 0
      ? 0
      : Math.round(webhookLatencies.reduce((sum: number, item: number) => sum + item, 0) / webhookLatencies.length);

  return {
    generatedAt: new Date(now).toISOString(),
    payouts: {
      total: totalPayouts,
      confirmed: confirmedPayouts,
      failed: failedPayouts,
      pending: pendingPayouts,
      successRate: ratio(confirmedPayouts, totalPayouts),
    },
    treasury: {
      totalBalanceUsdc: companies.reduce((sum: number, company: any) => sum + Number(company.treasuryBalanceUsdc ?? 0), 0),
      wallets: companies.map((company: any) => ({
        companyId: company.id,
        companyName: company.name,
        walletAddress: company.treasuryWalletAddress,
        balanceUsdc: Number(company.treasuryBalanceUsdc ?? 0),
        updatedAt: company.treasuryBalanceUpdatedAt,
      })),
    },
    webhooks: {
      processed: webhooks.filter((event: any) => event.processed).length,
      failed: webhooks.filter((event: any) => !event.processed).length,
      avgLatencyMs: avgWebhookLatencyMs,
    },
    escrow: {
      outstandingCount: staleEscrows.length,
      outstandingBalanceUsdc: staleEscrows.reduce(
        (sum: number, payout: any) => sum + Number(payout.amountUsdc ?? 0),
        0,
      ),
    },
  };
}

export async function getSystemHealth(companyId?: string) {
  const metrics = await getSystemMetrics(companyId);
  const [openCritical, failedJobs, deadLetters] = await Promise.all([
    db.reconciliationAudit.count({
      where: { ...(companyId ? { companyId } : {}), status: "OPEN", severity: "CRITICAL" },
    }),
    db.failedJob.count({ where: { status: "PERMANENT_FAILURE" } }),
    db.deadLetterWebhook.count({ where: { status: "PERMANENT_FAILURE" } }),
  ]);

  const degraded =
    openCritical > 0 ||
    failedJobs > 0 ||
    deadLetters > 0 ||
    metrics.payouts.successRate < 0.98 ||
    metrics.webhooks.failed > 0;

  return {
    ok: !degraded,
    status: degraded ? "DEGRADED" : "HEALTHY",
    service: "borderless-payroll-copilot",
    checkedAt: new Date().toISOString(),
    checks: {
      payoutSuccessRate: metrics.payouts.successRate,
      failedPayouts: metrics.payouts.failed,
      permanentFailedJobs: failedJobs,
      deadLetterWebhooks: deadLetters,
      openCriticalReconciliations: openCritical,
      treasuryWallets: metrics.treasury.wallets.length,
      escrowOutstandingBalanceUsdc: metrics.escrow.outstandingBalanceUsdc,
    },
  };
}
