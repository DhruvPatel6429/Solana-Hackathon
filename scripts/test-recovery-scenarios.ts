import "dotenv/config";

import {
  assertCondition,
  buildReport,
  loadTreasuryWalletFromEnv,
  printReport,
  requiredEnv,
  runCheck,
  writeJsonArtifact,
} from "./phase4-common";

import { prisma } from "../lib/db/prisma";
import { payoutRecoveryService } from "../lib/services/payout-recovery.service";
import { webhookRecoveryService } from "../lib/services/webhook-recovery.service";
import { createInvoice } from "../lib/services/invoice.service";
import { executePayout, DuplicatePayoutError } from "../lib/services/payout.service";
import { getSystemMetrics } from "../lib/services/metrics.service";
import { signDodoPayload } from "../lib/integrations/dodo/webhook";

const db = prisma as any;

async function main(): Promise<void> {
  const checks = [] as Awaited<ReturnType<typeof buildReport>>["checks"];

  const treasury = loadTreasuryWalletFromEnv();
  const contractorWallet = requiredEnv("TEST_CONTRACTOR_WALLET");
  const dodoSecret = requiredEnv("DODO_WEBHOOK_SECRET");

  const runId = `recovery_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const companyId = `company_${runId}`;
  const contractorId = `contractor_${runId}`;

  let stalePayoutId = "";

  await runCheck(checks, "Seed recovery test entities", async () => {
    await db.company.create({
      data: {
        id: companyId,
        name: `Phase4 Recovery Company ${runId}`,
        treasuryWalletAddress: treasury.publicKey.toBase58(),
        treasuryBalanceUsdc: "0",
      },
    });

    await db.contractor.create({
      data: {
        id: contractorId,
        companyId,
        name: `Recovery Contractor ${runId}`,
        email: `${runId}@example.com`,
        walletAddress: contractorWallet,
        kycStatus: "VERIFIED",
      },
    });

    return {
      companyId,
      contractorId,
    };
  });

  await runCheck(checks, "Failed payout recovery queueing", async () => {
    const invoice = await createInvoice({
      companyId,
      contractorId,
      amountUsdc: 0.02,
      workPeriodStart: "2026-05-01",
      workPeriodEnd: "2026-05-10",
      lineItems: [{ description: "Recovery test", quantity: 1, unitPrice: 0.02 }],
      notes: `recovery-failed-${runId}`,
    });

    const failedPayout = await db.payout.create({
      data: {
        companyId,
        contractorId,
        invoiceId: invoice.id,
        contractorWallet,
        amountUsdc: "0.02",
        currency: "USDC",
        status: "FAILED",
      },
    });

    stalePayoutId = failedPayout.id;

    const result = await payoutRecoveryService.reconcilePayout(failedPayout.id);
    assertCondition(result.status === "QUEUED_FOR_RETRY", `Expected QUEUED_FOR_RETRY, got ${result.status}`);

    const job = await db.failedJob.findFirst({
      where: {
        jobType: "PAYOUT_RETRY",
        entityId: failedPayout.id,
      },
    });

    assertCondition(Boolean(job), "Failed payout did not create retry job.");

    return {
      payoutId: failedPayout.id,
      recoveryStatus: result.status,
      retryJobId: job.id,
      nextRetryAt: job.nextRetryAt,
    };
  });

  await runCheck(checks, "Duplicate payout prevention", async () => {
    const invoice = await createInvoice({
      companyId,
      contractorId,
      amountUsdc: 0.03,
      workPeriodStart: "2026-05-01",
      workPeriodEnd: "2026-05-10",
      lineItems: [{ description: "Duplicate prevention", quantity: 1, unitPrice: 0.03 }],
      notes: `recovery-duplicate-${runId}`,
    });

    await db.payout.create({
      data: {
        companyId,
        contractorId,
        invoiceId: invoice.id,
        contractorWallet,
        amountUsdc: "0.03",
        currency: "USDC",
        status: "PENDING",
      },
    });

    let blocked = false;
    try {
      await executePayout({
        invoiceId: invoice.id,
        wallet: contractorWallet,
        amount: 0.03,
        companyId,
      });
    } catch (error) {
      blocked = error instanceof DuplicatePayoutError;
      if (!blocked) {
        throw error;
      }
    }

    assertCondition(blocked, "Duplicate payout prevention did not trigger.");

    return {
      invoiceId: invoice.id,
      duplicateBlocked: blocked,
    };
  });

  await runCheck(checks, "Stale escrow detection", async () => {
    await db.payout.update({
      where: { id: stalePayoutId },
      data: {
        escrowPda: `stale_${runId}`,
        status: "PENDING",
      },
    });

    const metrics = await getSystemMetrics(companyId);

    assertCondition(metrics.escrow.outstandingCount >= 1, "Stale escrow was not detected in metrics.");

    return {
      outstandingCount: metrics.escrow.outstandingCount,
      outstandingBalanceUsdc: metrics.escrow.outstandingBalanceUsdc,
    };
  });

  await runCheck(checks, "Webhook retry replay", async () => {
    const eventId = `recover_dodo_${runId}`;
    const payload = JSON.stringify({
      id: eventId,
      type: "payment.succeeded",
      data: {
        dodoPaymentId: `recover_pay_${runId}`,
        companyId,
        customerEmail: `${runId}@example.com`,
        amountUsd: "11.00",
        currency: "USD",
      },
    });

    const signature = signDodoPayload(payload, dodoSecret);

    await webhookRecoveryService.recordFailure({
      provider: "dodo",
      externalId: eventId,
      signature,
      payload: JSON.parse(payload),
      error: new Error("forced dodo failure for replay test"),
      correlationId: runId,
    });

    const replayResults = await webhookRecoveryService.replayFailedWebhooks(10);
    const replayed = replayResults.find((item) => item.status === "REPLAYED");

    assertCondition(Boolean(replayed), "Webhook replay did not resolve the dead-letter webhook.");

    const deadLetter = await db.deadLetterWebhook.findUnique({
      where: {
        provider_externalId: {
          provider: "dodo",
          externalId: eventId,
        },
      },
    });

    assertCondition(deadLetter?.status === "REPLAYED", `Dead-letter status expected REPLAYED, got ${deadLetter?.status}.`);

    return {
      replayResults,
      deadLetterId: deadLetter?.id,
      finalStatus: deadLetter?.status,
    };
  });

  await runCheck(checks, "Reconciliation recovery", async () => {
    const mismatches = await payoutRecoveryService.detectTreasuryMismatches(companyId);

    assertCondition(mismatches.length === 1, `Expected one company mismatch result, got ${mismatches.length}.`);

    const audits = await db.reconciliationAudit.findMany({
      where: {
        companyId,
        scope: "TREASURY_BALANCE_MISMATCH",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    assertCondition(audits.length >= 1, "Treasury mismatch recovery did not persist reconciliation audit.");

    return {
      mismatches,
      reconciliationAuditIds: audits.map((audit: any) => audit.id),
    };
  });

  const report = buildReport("test-recovery-scenarios", checks);

  await writeJsonArtifact("artifacts/recovery-validation-report.json", {
    ...report,
    runId,
    companyId,
    contractorId,
  });

  printReport(report);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] test-recovery-scenarios failed: ${message}`);
  process.exitCode = 1;
});
