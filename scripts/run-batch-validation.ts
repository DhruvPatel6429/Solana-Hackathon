import "dotenv/config";

import { PublicKey } from "@solana/web3.js";

import {
  assertCondition,
  buildReport,
  explorerTxUrl,
  getConnection,
  getUsdcBalance,
  getUsdcMint,
  loadTreasuryWalletFromEnv,
  parsePublicKey,
  printReport,
  runCheck,
  usdcToBaseUnitsString,
  writeJsonArtifact,
} from "./phase4-common";

import { executeBatchPayout } from "../lib/solana/transfer";
import { prisma } from "../lib/db/prisma";
import { recordReconciliationAudit } from "../lib/services/reconciliation.service";

const db = prisma as any;

function requireBatchWallet(index: number): PublicKey {
  const envName = `TEST_BATCH_WALLET_${index}`;
  const value = process.env[envName]?.trim();
  if (!value) {
    throw new Error(`[phase4] Missing required env var: ${envName}`);
  }
  return parsePublicKey(value, envName);
}

async function main(): Promise<void> {
  const checks = [] as Awaited<ReturnType<typeof buildReport>>["checks"];

  const connection = getConnection();
  const mint = getUsdcMint();
  const treasury = loadTreasuryWalletFromEnv();

  const recipients = [1, 2, 3, 4, 5].map((index) => ({
    wallet: requireBatchWallet(index),
    amount: Number(process.env.BATCH_AMOUNT_USDC ?? "0.02"),
  }));

  assertCondition(
    recipients.every((recipient) => recipient.amount > 0),
    "BATCH_AMOUNT_USDC must be positive.",
  );

  const totalAmount = recipients.reduce((sum, recipient) => sum + recipient.amount, 0);
  const totalAmountBaseUnits = BigInt(usdcToBaseUnitsString(totalAmount));

  const runId = `batch_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const companyId = `company_${runId}`;

  const beforeBalances = new Map<string, Awaited<ReturnType<typeof getUsdcBalance>>>();
  const afterBalances = new Map<string, Awaited<ReturnType<typeof getUsdcBalance>>>();

  let signature = "";

  await runCheck(checks, "Seed batch validation company + contractor wallets", async () => {
    await db.company.create({
      data: {
        id: companyId,
        name: `Phase4 Batch Company ${runId}`,
        treasuryWalletAddress: treasury.publicKey.toBase58(),
      },
    });

    for (const [index, recipient] of recipients.entries()) {
      await db.contractor.create({
        data: {
          id: `contractor_${runId}_${index + 1}`,
          companyId,
          name: `Batch Recipient ${index + 1}`,
          email: `${runId}_${index + 1}@example.com`,
          walletAddress: recipient.wallet.toBase58(),
          kycStatus: "VERIFIED",
        },
      });
    }

    return {
      companyId,
      recipientCount: recipients.length,
    };
  });

  await runCheck(checks, "Snapshot pre-batch balances", async () => {
    for (const recipient of recipients) {
      beforeBalances.set(
        recipient.wallet.toBase58(),
        await getUsdcBalance(connection, recipient.wallet, mint),
      );
    }

    beforeBalances.set(
      treasury.publicKey.toBase58(),
      await getUsdcBalance(connection, treasury.publicKey, mint),
    );

    return {
      treasury: beforeBalances.get(treasury.publicKey.toBase58()),
      recipients: recipients.map((recipient) => ({
        wallet: recipient.wallet.toBase58(),
        balance: beforeBalances.get(recipient.wallet.toBase58()),
      })),
    };
  });

  await runCheck(checks, "Execute atomic batch payout", async () => {
    const result = await executeBatchPayout(
      recipients.map((recipient) => ({
        wallet: recipient.wallet.toBase58(),
        amount: recipient.amount,
      })),
    );

    signature = result.signature;

    return {
      signature,
      explorerUrl: explorerTxUrl(signature),
      recipientCount: recipients.length,
      totalAmount,
    };
  });

  await runCheck(checks, "Verify balances changed correctly", async () => {
    for (const recipient of recipients) {
      afterBalances.set(
        recipient.wallet.toBase58(),
        await getUsdcBalance(connection, recipient.wallet, mint),
      );
    }

    afterBalances.set(
      treasury.publicKey.toBase58(),
      await getUsdcBalance(connection, treasury.publicKey, mint),
    );

    const recipientDeltas = recipients.map((recipient) => {
      const wallet = recipient.wallet.toBase58();
      const before = BigInt(beforeBalances.get(wallet)?.amount ?? "0");
      const after = BigInt(afterBalances.get(wallet)?.amount ?? "0");
      const delta = after - before;
      const expected = BigInt(usdcToBaseUnitsString(recipient.amount));

      assertCondition(
        delta >= expected,
        `Recipient ${wallet} delta ${delta.toString()} is less than expected ${expected.toString()}.`,
      );

      return {
        wallet,
        before: before.toString(),
        after: after.toString(),
        delta: delta.toString(),
        expected: expected.toString(),
      };
    });

    const treasuryBefore = BigInt(beforeBalances.get(treasury.publicKey.toBase58())?.amount ?? "0");
    const treasuryAfter = BigInt(afterBalances.get(treasury.publicKey.toBase58())?.amount ?? "0");
    const treasuryDelta = treasuryBefore - treasuryAfter;

    assertCondition(
      treasuryDelta >= totalAmountBaseUnits,
      `Treasury delta ${treasuryDelta.toString()} is less than required total ${totalAmountBaseUnits.toString()}.`,
    );

    return {
      recipientDeltas,
      treasury: {
        before: treasuryBefore.toString(),
        after: treasuryAfter.toString(),
        delta: treasuryDelta.toString(),
        expectedAtLeast: totalAmountBaseUnits.toString(),
      },
    };
  });

  await runCheck(checks, "Verify explorer transaction + DB reconciliation", async () => {
    const tx = await connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });

    assertCondition(tx, `Batch transaction ${signature} not found on explorer.`);
    assertCondition(tx.meta?.err == null, `Batch transaction ${signature} failed: ${JSON.stringify(tx.meta?.err)}.`);

    await recordReconciliationAudit({
      companyId,
      scope: "BATCH_PAYOUT_VALIDATION",
      entityType: "BatchPayout",
      entityId: signature,
      status: "RESOLVED",
      expectedValue: totalAmount,
      actualValue: totalAmount,
      txSignature: signature,
      metadata: {
        recipientCount: recipients.length,
        recipients: recipients.map((recipient) => recipient.wallet.toBase58()),
      },
    });

    const audit = await db.reconciliationAudit.findFirst({
      where: {
        companyId,
        scope: "BATCH_PAYOUT_VALIDATION",
        txSignature: signature,
      },
    });

    assertCondition(Boolean(audit), "Batch reconciliation audit record was not persisted.");

    return {
      signature,
      explorerUrl: explorerTxUrl(signature),
      reconciliationAuditId: audit?.id,
    };
  });

  const report = buildReport("run-batch-validation", checks);

  await writeJsonArtifact("artifacts/batch-validation-report.json", {
    ...report,
    runId,
    companyId,
    signature,
    explorerUrl: signature ? explorerTxUrl(signature) : null,
    recipients: recipients.map((recipient) => ({
      wallet: recipient.wallet.toBase58(),
      amountUsdc: recipient.amount,
      before: beforeBalances.get(recipient.wallet.toBase58()),
      after: afterBalances.get(recipient.wallet.toBase58()),
    })),
    treasury: {
      wallet: treasury.publicKey.toBase58(),
      before: beforeBalances.get(treasury.publicKey.toBase58()),
      after: afterBalances.get(treasury.publicKey.toBase58()),
    },
  });

  printReport(report);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] run-batch-validation failed: ${message}`);
  process.exitCode = 1;
});
