import { prisma } from "@/lib/db/prisma";
import { getEscrowStatus, releaseEscrow } from "@/lib/solana/escrow";
import { recordReconciliationAudit } from "@/lib/services/reconciliation.service";

const db = prisma as any;

export class EscrowRecoveryService {
  async detectStuckEscrows(options: { companyId?: string; staleMinutes?: number; limit?: number } = {}) {
    const staleBefore = new Date(Date.now() - (options.staleMinutes ?? 60) * 60 * 1000);
    const payouts = await db.payout.findMany({
      where: {
        ...(options.companyId ? { companyId: options.companyId } : {}),
        escrowPda: { not: null },
        status: { in: ["PENDING", "FAILED"] },
        createdAt: { lte: staleBefore },
      },
      orderBy: { createdAt: "asc" },
      take: options.limit ?? 25,
    });

    const findings = [];
    for (const payout of payouts) {
      const status = await getEscrowStatus(payout.invoiceId);
      if (status.exists && !status.isReleased) {
        await recordReconciliationAudit({
          companyId: payout.companyId,
          scope: "STALE_ESCROW",
          entityType: "Payout",
          entityId: payout.id,
          severity: "WARN",
          expectedValue: payout.amountUsdc,
          actualValue: status.amount,
          metadata: {
            invoiceId: payout.invoiceId,
            escrowPda: status.escrowPda,
            vault: status.vault,
          },
        });
        findings.push({ payoutId: payout.id, invoiceId: payout.invoiceId, escrowPda: status.escrowPda });
      }
    }

    return findings;
  }

  async releaseOrReconcileStuckEscrow(payoutId: string) {
    const payout = await db.payout.findUnique({ where: { id: payoutId } });
    if (!payout) {
      return { payoutId, status: "NOT_FOUND" };
    }

    const status = await getEscrowStatus(payout.invoiceId);
    if (!status.exists) {
      await recordReconciliationAudit({
        companyId: payout.companyId,
        scope: "ESCROW_NOT_FOUND",
        entityType: "Payout",
        entityId: payout.id,
        severity: "CRITICAL",
        metadata: { invoiceId: payout.invoiceId, escrowPda: payout.escrowPda },
      });
      return { payoutId, status: "ESCROW_NOT_FOUND" };
    }

    if (status.isReleased) {
      await db.payout.update({
        where: { id: payout.id },
        data: { status: "CONFIRMED", executedAt: payout.executedAt ?? new Date() },
      });
      return { payoutId, status: "RECONCILED_ALREADY_RELEASED" };
    }

    const release = await releaseEscrow({
      invoiceId: payout.invoiceId,
      contractorWallet: payout.contractorWallet,
    });
    await prisma.$transaction([
      db.payout.update({
        where: { id: payout.id },
        data: {
          status: "CONFIRMED",
          txSignature: release.signature,
          escrowPda: release.escrowPda,
          executedAt: new Date(),
        },
      }),
      db.invoice.update({
        where: { id: payout.invoiceId },
        data: { status: "PAID" },
      }),
    ]);

    await recordReconciliationAudit({
      companyId: payout.companyId,
      scope: "ESCROW_RECOVERY_RELEASE",
      entityType: "Payout",
      entityId: payout.id,
      status: "RESOLVED",
      txSignature: release.signature,
      metadata: { invoiceId: payout.invoiceId, escrowPda: release.escrowPda },
    });

    return { payoutId, status: "RELEASED", txSignature: release.signature };
  }
}

export const escrowRecoveryService = new EscrowRecoveryService();
