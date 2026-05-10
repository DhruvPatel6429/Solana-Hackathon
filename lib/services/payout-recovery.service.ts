import { connection } from "@/lib/solana/connection";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/utils/logger";
import { recordReconciliationAudit } from "@/lib/services/reconciliation.service";

const db = prisma as any;

const TRANSIENT_PATTERNS = [
  /timeout/i,
  /429/,
  /blockhash/i,
  /fetch/i,
  /temporar/i,
  /rate/i,
  /network/i,
];

function backoff(attempts: number): Date {
  const seconds = Math.min(60 * 60, 2 ** Math.max(1, attempts) * 30);
  return new Date(Date.now() + seconds * 1000);
}

function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(message));
}

export class PayoutRecoveryService {
  async reconcileFailedPayouts(options: { companyId?: string; limit?: number } = {}) {
    const failedPayouts = await db.payout.findMany({
      where: {
        ...(options.companyId ? { companyId: options.companyId } : {}),
        status: { in: ["FAILED", "PENDING"] },
      },
      orderBy: { createdAt: "asc" },
      take: options.limit ?? 25,
    });

    const results = [];
    for (const payout of failedPayouts) {
      results.push(await this.reconcilePayout(payout.id));
    }
    return results;
  }

  async reconcilePayout(payoutId: string) {
    const payout = await db.payout.findUnique({ where: { id: payoutId } });
    if (!payout) {
      return { payoutId, status: "NOT_FOUND" };
    }

    if (payout.txSignature) {
      const tx = await (connection as any).getSignatureStatus(payout.txSignature, {
        searchTransactionHistory: true,
      });
      if (tx.value?.confirmationStatus === "confirmed" || tx.value?.confirmationStatus === "finalized") {
        await prisma.$transaction([
          db.payout.update({
            where: { id: payout.id },
            data: { status: "CONFIRMED", executedAt: payout.executedAt ?? new Date() },
          }),
          db.invoice.update({
            where: { id: payout.invoiceId },
            data: { status: "PAID" },
          }),
        ]);

        await recordReconciliationAudit({
          companyId: payout.companyId,
          scope: "PAYOUT_RECOVERY",
          entityType: "Payout",
          entityId: payout.id,
          status: "RESOLVED",
          txSignature: payout.txSignature,
          metadata: { reason: "confirmed_on_chain" },
        });

        return { payoutId, status: "CONFIRMED_ON_CHAIN" };
      }
    }

    const duplicate = await db.payout.findMany({
      where: {
        invoiceId: payout.invoiceId,
        status: "CONFIRMED",
        id: { not: payout.id },
      },
    });
    if (duplicate.length > 0) {
      await db.payout.update({
        where: { id: payout.id },
        data: { status: "DUPLICATE_BLOCKED" },
      });
      await recordReconciliationAudit({
        companyId: payout.companyId,
        scope: "DUPLICATE_PAYOUT_PREVENTION",
        entityType: "Payout",
        entityId: payout.id,
        severity: "CRITICAL",
        metadata: { invoiceId: payout.invoiceId, duplicateIds: duplicate.map((item: any) => item.id) },
      });
      return { payoutId, status: "DUPLICATE_BLOCKED" };
    }

    await db.failedJob.upsert({
      where: { id: `payout-retry-${payout.id}` },
      create: {
        id: `payout-retry-${payout.id}`,
        jobType: "PAYOUT_RETRY",
        entityType: "Payout",
        entityId: payout.id,
        status: "PENDING_RETRY",
        nextRetryAt: backoff(1),
        metadata: { invoiceId: payout.invoiceId },
      },
      update: {
        status: "PENDING_RETRY",
        nextRetryAt: backoff(1),
      },
    });

    return { payoutId, status: "QUEUED_FOR_RETRY" };
  }

  async retryTransientFailures(limit = 10) {
    const jobs = await db.failedJob.findMany({
      where: {
        jobType: "PAYOUT_RETRY",
        status: "PENDING_RETRY",
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    const results = [];
    for (const job of jobs) {
      const payout = await db.payout.findUnique({ where: { id: job.entityId } });
      if (!payout) {
        await db.failedJob.update({
          where: { id: job.id },
          data: { status: "PERMANENT_FAILURE", lastError: "Payout not found", resolvedAt: new Date() },
        });
        continue;
      }

      try {
        const { executePayout } = await import("@/lib/services/payout.service");
        const result = await executePayout({
          invoiceId: payout.invoiceId,
          wallet: payout.contractorWallet,
          amount: Number(payout.amountUsdc),
          companyId: payout.companyId ?? undefined,
        });
        await db.failedJob.update({
          where: { id: job.id },
          data: { status: "RESOLVED", resolvedAt: new Date(), lastError: null },
        });
        results.push({ jobId: job.id, status: "RESOLVED", txSignature: result.txHash });
      } catch (error) {
        const attempts = job.attempts + 1;
        const permanent = attempts >= job.maxAttempts || !isTransient(error);
        const message = error instanceof Error ? error.message : String(error);
        await db.failedJob.update({
          where: { id: job.id },
          data: {
            attempts,
            status: permanent ? "PERMANENT_FAILURE" : "PENDING_RETRY",
            nextRetryAt: permanent ? null : backoff(attempts),
            lastError: message,
            resolvedAt: permanent ? new Date() : null,
          },
        });
        logger.warn("Payout recovery retry failed", {
          payoutId: payout.id,
          invoiceId: payout.invoiceId,
          severity: permanent ? "error" : "warn",
          error: message,
        });
        results.push({ jobId: job.id, status: permanent ? "PERMANENT_FAILURE" : "PENDING_RETRY" });
      }
    }

    return results;
  }

  async detectTreasuryMismatches(companyId?: string) {
    const companies = await db.company.findMany({
      where: {
        ...(companyId ? { id: companyId } : {}),
        treasuryWalletAddress: { not: null },
      },
      take: 100,
    });

    const results = [];
    for (const company of companies) {
      const { getTreasuryBalance } = await import("@/lib/services/treasury.service");
      const liveBalance = await getTreasuryBalance(company.treasuryWalletAddress);
      const dbBalance = Number(company.treasuryBalanceUsdc ?? 0);
      const delta = liveBalance - dbBalance;
      if (Math.abs(delta) >= 0.01) {
        await recordReconciliationAudit({
          companyId: company.id,
          scope: "TREASURY_BALANCE_MISMATCH",
          entityType: "Company",
          entityId: company.id,
          severity: Math.abs(delta) >= 100 ? "CRITICAL" : "WARN",
          expectedValue: dbBalance,
          actualValue: liveBalance,
          metadata: { walletAddress: company.treasuryWalletAddress },
        });
      }
      results.push({ companyId: company.id, dbBalance, liveBalance, delta });
    }

    return results;
  }
}

export const payoutRecoveryService = new PayoutRecoveryService();
