import "dotenv/config";

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

import { transferWithSplit } from "../lib/solana/transfer";
import { prisma } from "../lib/db/prisma";
import { recordReconciliationAudit } from "../lib/services/reconciliation.service";

const db = prisma as any;

async function main(): Promise<void> {
  const checks = [] as Awaited<ReturnType<typeof buildReport>>["checks"];

  const connection = getConnection();
  const mint = getUsdcMint();
  const treasury = loadTreasuryWalletFromEnv();

  const contractor = parsePublicKey(
    process.env.TEST_CONTRACTOR_WALLET?.trim() || "",
    "TEST_CONTRACTOR_WALLET",
  );
  const feeWallet = parsePublicKey(process.env.TEST_FEE_WALLET?.trim() || "", "TEST_FEE_WALLET");
  const amountUsdc = Number(process.env.SPLIT_VALIDATION_AMOUNT_USDC ?? "0.10");

  assertCondition(amountUsdc > 0, "SPLIT_VALIDATION_AMOUNT_USDC must be positive.");

  const runId = `split_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const companyId = `company_${runId}`;

  let signature = "";

  const before = {
    contractor: await getUsdcBalance(connection, contractor, mint),
    fee: await getUsdcBalance(connection, feeWallet, mint),
    treasury: await getUsdcBalance(connection, treasury.publicKey, mint),
  };

  let after = before;

  await runCheck(checks, "Seed split validation company", async () => {
    await db.company.create({
      data: {
        id: companyId,
        name: `Phase4 Split Company ${runId}`,
        treasuryWalletAddress: treasury.publicKey.toBase58(),
      },
    });

    return {
      companyId,
      treasuryWallet: treasury.publicKey.toBase58(),
    };
  });

  await runCheck(checks, "Execute split settlement", async () => {
    const result = await transferWithSplit({
      contractorWallet: contractor.toBase58(),
      feeWallet: feeWallet.toBase58(),
      amount: amountUsdc,
    });

    signature = result.signature;

    return {
      signature,
      explorerUrl: explorerTxUrl(signature),
      amountUsdc,
      expectedContractorPercent: 95,
      expectedFeePercent: 5,
    };
  });

  await runCheck(checks, "Verify 95/5 routing from balances", async () => {
    after = {
      contractor: await getUsdcBalance(connection, contractor, mint),
      fee: await getUsdcBalance(connection, feeWallet, mint),
      treasury: await getUsdcBalance(connection, treasury.publicKey, mint),
    };

    const contractorDelta = BigInt(after.contractor.amount) - BigInt(before.contractor.amount);
    const feeDelta = BigInt(after.fee.amount) - BigInt(before.fee.amount);
    const treasuryDelta = BigInt(before.treasury.amount) - BigInt(after.treasury.amount);

    const total = BigInt(usdcToBaseUnitsString(amountUsdc));
    const expectedContractor = (total * 95n) / 100n;
    const expectedFee = total - expectedContractor;

    assertCondition(
      contractorDelta === expectedContractor,
      `Contractor delta mismatch: expected ${expectedContractor.toString()}, got ${contractorDelta.toString()}.`,
    );
    assertCondition(
      feeDelta === expectedFee,
      `Fee delta mismatch: expected ${expectedFee.toString()}, got ${feeDelta.toString()}.`,
    );
    assertCondition(
      treasuryDelta >= total,
      `Treasury delta mismatch: expected at least ${total.toString()}, got ${treasuryDelta.toString()}.`,
    );

    return {
      expected: {
        contractor: expectedContractor.toString(),
        fee: expectedFee.toString(),
        total: total.toString(),
      },
      actual: {
        contractor: contractorDelta.toString(),
        fee: feeDelta.toString(),
        treasury: treasuryDelta.toString(),
      },
    };
  });

  await runCheck(checks, "Verify explorer tx + reconciliation record", async () => {
    const tx = await connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });

    assertCondition(tx, `Split transaction ${signature} not found.`);
    assertCondition(tx.meta?.err == null, `Split transaction failed with ${JSON.stringify(tx.meta?.err)}.`);

    await recordReconciliationAudit({
      companyId,
      scope: "SPLIT_SETTLEMENT_VALIDATION",
      entityType: "SplitSettlement",
      entityId: signature,
      status: "RESOLVED",
      txSignature: signature,
      expectedValue: amountUsdc,
      actualValue: amountUsdc,
      metadata: {
        contractorWallet: contractor.toBase58(),
        feeWallet: feeWallet.toBase58(),
      },
    });

    const audit = await db.reconciliationAudit.findFirst({
      where: {
        companyId,
        scope: "SPLIT_SETTLEMENT_VALIDATION",
        txSignature: signature,
      },
    });

    assertCondition(Boolean(audit), "Split reconciliation record missing.");

    return {
      signature,
      explorerUrl: explorerTxUrl(signature),
      reconciliationAuditId: audit?.id,
    };
  });

  const report = buildReport("run-split-validation", checks);

  await writeJsonArtifact("artifacts/split-validation-report.json", {
    ...report,
    runId,
    companyId,
    signature,
    explorerUrl: signature ? explorerTxUrl(signature) : null,
    before,
    after,
    amountUsdc,
  });

  printReport(report);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] run-split-validation failed: ${message}`);
  process.exitCode = 1;
});
