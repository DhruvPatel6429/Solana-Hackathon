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
  requiredEnv,
  runCheck,
  writeJsonArtifact,
} from "./phase4-common";

import { prisma } from "../lib/db/prisma";
import { createInvoice, approveInvoice } from "../lib/services/invoice.service";
import { initializeEscrow, depositEscrow } from "../lib/solana/escrow";
import { executePayout } from "../lib/services/payout.service";
import { getSystemMetrics } from "../lib/services/metrics.service";
import { getReconciliationReport } from "../lib/services/reconciliation.service";

const db = prisma as any;

async function main(): Promise<void> {
  const checks = [] as Awaited<ReturnType<typeof buildReport>>["checks"];
  const connection = getConnection();
  const mint = getUsdcMint();
  const treasury = loadTreasuryWalletFromEnv();

  const contractorWallet = parsePublicKey(requiredEnv("TEST_CONTRACTOR_WALLET"), "TEST_CONTRACTOR_WALLET");
  const companyWallet = parsePublicKey(requiredEnv("TEST_COMPANY_WALLET"), "TEST_COMPANY_WALLET");
  const invoiceAmountUsdc = Number(process.env.LIVE_PAYROLL_AMOUNT_USDC ?? "0.05");
  assertCondition(invoiceAmountUsdc > 0, "LIVE_PAYROLL_AMOUNT_USDC must be a positive number.");

  const runId = `live_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const companyId = `company_${runId}`;
  const contractorId = `contractor_${runId}`;

  let invoiceId = "";
  let initializeSignature: string | undefined;
  let depositSignature: string | undefined;
  let payoutSignature = "";
  let payoutId = "";
  let escrowPda = "";

  const snapshots: {
    contractorBefore?: Awaited<ReturnType<typeof getUsdcBalance>>;
    contractorAfter?: Awaited<ReturnType<typeof getUsdcBalance>>;
    treasuryBefore?: Awaited<ReturnType<typeof getUsdcBalance>>;
    treasuryAfter?: Awaited<ReturnType<typeof getUsdcBalance>>;
  } = {};

  await runCheck(checks, "Create test company + contractor + invoice", async () => {
    await db.company.create({
      data: {
        id: companyId,
        name: `Phase4 Company ${runId}`,
        treasuryWalletAddress: companyWallet.toBase58(),
      },
    });

    await db.contractor.create({
      data: {
        id: contractorId,
        companyId,
        name: `Phase4 Contractor ${runId}`,
        email: `${runId}@example.com`,
        walletAddress: contractorWallet.toBase58(),
        kycStatus: "VERIFIED",
      },
    });

    const invoice = await createInvoice({
      companyId,
      contractorId,
      amountUsdc: invoiceAmountUsdc,
      workPeriodStart: "2026-05-01",
      workPeriodEnd: "2026-05-10",
      lineItems: [{ description: "Phase 4 live payroll validation", quantity: 1, unitPrice: invoiceAmountUsdc }],
      notes: `phase4-live-${runId}`,
    });

    invoiceId = invoice.id;

    return {
      companyId,
      contractorId,
      invoiceId,
      invoiceAmountUsdc,
    };
  });

  await runCheck(checks, "Snapshot balances before payout", async () => {
    snapshots.contractorBefore = await getUsdcBalance(connection, contractorWallet, mint);
    snapshots.treasuryBefore = await getUsdcBalance(connection, treasury.publicKey, mint);

    return {
      contractorBefore: snapshots.contractorBefore,
      treasuryBefore: snapshots.treasuryBefore,
    };
  });

  await runCheck(checks, "Initialize escrow", async () => {
    const initialized = await initializeEscrow({ invoiceId });
    initializeSignature = initialized.signature;
    escrowPda = initialized.escrowPda;

    return {
      invoiceId,
      escrowPda,
      vault: initialized.vault,
      signature: initializeSignature ?? "already_initialized",
    };
  });

  await runCheck(checks, "Deposit devnet USDC to escrow", async () => {
    const deposited = await depositEscrow({
      invoiceId,
      amount: invoiceAmountUsdc,
    });
    depositSignature = deposited.signature;

    return {
      invoiceId,
      escrowPda: deposited.escrowPda,
      signature: depositSignature ?? "already_funded",
      amountBaseUnits: deposited.amountBaseUnits,
    };
  });

  await runCheck(checks, "Approve invoice", async () => {
    const approved = await approveInvoice({
      invoiceId,
      adminId: `phase4-admin-${runId}`,
    });

    return {
      invoiceId: approved.id,
      status: approved.status,
      approvedAt: approved.approvedAt?.toISOString() ?? null,
    };
  });

  await runCheck(checks, "Release escrow via payout execution", async () => {
    const payout = await executePayout({
      invoiceId,
      wallet: contractorWallet.toBase58(),
      amount: invoiceAmountUsdc,
      companyId,
    });

    payoutSignature = payout.txHash;
    payoutId = payout.payoutId;

    return {
      payoutId,
      payoutSignature,
      explorerUrl: explorerTxUrl(payoutSignature),
    };
  });

  await runCheck(checks, "Verify contractor balance delta", async () => {
    snapshots.contractorAfter = await getUsdcBalance(connection, contractorWallet, mint);
    snapshots.treasuryAfter = await getUsdcBalance(connection, treasury.publicKey, mint);

    assertCondition(
      Number(snapshots.contractorAfter.amount) > Number(snapshots.contractorBefore?.amount ?? "0"),
      "Contractor USDC balance did not increase after payout.",
    );

    return {
      contractorBefore: snapshots.contractorBefore,
      contractorAfter: snapshots.contractorAfter,
      treasuryBefore: snapshots.treasuryBefore,
      treasuryAfter: snapshots.treasuryAfter,
    };
  });

  await runCheck(checks, "Verify DB persistence + explorer transaction", async () => {
    const [invoice, payout, tx] = await Promise.all([
      db.invoice.findUnique({ where: { id: invoiceId } }),
      db.payout.findUnique({ where: { invoiceId } }),
      connection.getTransaction(payoutSignature, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      }),
    ]);

    assertCondition(invoice, `Invoice ${invoiceId} missing in DB.`);
    assertCondition(invoice.status === "PAID", `Invoice ${invoiceId} expected PAID, got ${invoice.status}.`);
    assertCondition(payout, `Payout for invoice ${invoiceId} missing in DB.`);
    assertCondition(payout.status === "CONFIRMED", `Payout ${payout.id} expected CONFIRMED, got ${payout.status}.`);
    assertCondition(
      payout.txSignature === payoutSignature,
      `Payout signature mismatch. Expected ${payoutSignature}, got ${payout.txSignature}.`,
    );

    assertCondition(tx, `Explorer transaction ${payoutSignature} not found on devnet.`);
    assertCondition(tx.meta?.err == null, `Explorer transaction ${payoutSignature} failed with ${JSON.stringify(tx.meta?.err)}.`);

    return {
      invoiceStatus: invoice.status,
      payoutStatus: payout.status,
      payoutId: payout.id,
      payoutSignature,
      explorerUrl: explorerTxUrl(payoutSignature),
    };
  });

  let metricsSnapshot: Awaited<ReturnType<typeof getSystemMetrics>> | null = null;
  let reconciliationSnapshot: Awaited<ReturnType<typeof getReconciliationReport>> | null = null;

  await runCheck(checks, "Verify dashboard state (metrics + reconciliation)", async () => {
    metricsSnapshot = await getSystemMetrics(companyId);
    reconciliationSnapshot = await getReconciliationReport(companyId);

    assertCondition(metricsSnapshot.payouts.confirmed >= 1, "Metrics confirmed payout count did not update.");

    return {
      metrics: {
        payouts: metricsSnapshot.payouts,
        treasury: metricsSnapshot.treasury,
      },
      reconciliationSummary: reconciliationSnapshot.summary,
    };
  });

  const auditRecords = await db.auditLog.findMany({
    where: {
      companyId,
      action: {
        in: ["INVOICE_APPROVED", "payout_confirmed", "payout_failed"],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const report = buildReport("run-live-payroll-flow", checks);

  await Promise.all([
    writeJsonArtifact("artifacts/live-validation/live-payroll-report.json", {
      ...report,
      runId,
      companyId,
      contractorId,
      invoiceId,
      payoutId,
      signatures: {
        initialize: initializeSignature ?? null,
        deposit: depositSignature ?? null,
        release: payoutSignature,
      },
      escrowPda,
    }),
    writeJsonArtifact("artifacts/live-validation/tx-signatures.json", {
      runId,
      invoiceId,
      initializeSignature: initializeSignature ?? null,
      depositSignature: depositSignature ?? null,
      releaseSignature: payoutSignature,
    }),
    writeJsonArtifact("artifacts/live-validation/explorer-urls.json", {
      runId,
      initialize: initializeSignature ? explorerTxUrl(initializeSignature) : null,
      deposit: depositSignature ? explorerTxUrl(depositSignature) : null,
      release: explorerTxUrl(payoutSignature),
      escrowPda: `https://explorer.solana.com/address/${escrowPda}?cluster=devnet`,
    }),
    writeJsonArtifact("artifacts/live-validation/balance-snapshots.json", {
      runId,
      mint: mint.toBase58(),
      contractor: {
        wallet: contractorWallet.toBase58(),
        before: snapshots.contractorBefore,
        after: snapshots.contractorAfter,
      },
      treasury: {
        wallet: treasury.publicKey.toBase58(),
        before: snapshots.treasuryBefore,
        after: snapshots.treasuryAfter,
      },
    }),
    writeJsonArtifact("artifacts/live-validation/db-reconciliation-snapshot.json", {
      runId,
      metrics: metricsSnapshot,
      reconciliation: reconciliationSnapshot,
    }),
    writeJsonArtifact("artifacts/live-validation/payout-audit-records.json", {
      runId,
      companyId,
      invoiceId,
      auditRecords,
    }),
  ]);

  printReport(report);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] run-live-payroll-flow failed: ${message}`);
  process.exitCode = 1;
});
