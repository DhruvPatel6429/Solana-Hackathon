import assert from "node:assert/strict";
import { describe, test } from "node:test";

const runDevnet = process.env.RUN_DEVNET_E2E === "1";
const describeDevnet = runDevnet ? describe : describe.skip;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for RUN_DEVNET_E2E=1`);
  }
  return value;
}

async function tokenBalance(walletAddress: string): Promise<number> {
  const [{ PublicKey }, { connection }, { DEVNET_USDC_MINT, USDC_DECIMALS }] = await Promise.all([
    import("@solana/web3.js"),
    import("@/lib/solana/connection"),
    import("@/lib/solana/tokens"),
  ]);

  const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(walletAddress), {
    mint: DEVNET_USDC_MINT,
  });
  const raw = accounts.value[0]?.account.data.parsed.info.tokenAmount.amount ?? "0";
  return Number(BigInt(raw)) / 10 ** USDC_DECIMALS;
}

async function assertExplorerTransaction(signature: string) {
  const { connection } = await import("@/lib/solana/connection");
  const tx = await (connection as any).getTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  assert.ok(tx, `missing finalized explorer transaction for ${signature}`);
  assert.equal(tx.meta?.err ?? null, null);
}

describeDevnet("real Solana devnet payroll flow", () => {
  test("validates treasury, invoice, escrow, payout, split, batch, billing, Helius, DB reconciliation, and explorer proof", async () => {
    process.env.DATABASE_URL = process.env.DEVNET_E2E_DATABASE_URL ?? required("DATABASE_URL");
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    process.env.TREASURY_WALLET_ADDRESS = required("TREASURY_WALLET_ADDRESS");

    const [
      { prisma },
      { createInvoice, approveInvoice },
      { executePayout },
      { getEscrowStatus },
      { getTreasuryBalance, processHeliusTreasuryWebhook },
      { DEVNET_USDC_MINT },
      { transferWithSplit, executeBatchPayout },
      { handleDodoWebhook },
      { signDodoPayload },
      { getSystemMetrics },
      { getReconciliationReport },
    ] = await Promise.all([
      import("@/lib/db/prisma"),
      import("@/lib/services/invoice.service"),
      import("@/lib/services/payout.service"),
      import("@/lib/solana/escrow"),
      import("@/lib/services/treasury.service"),
      import("@/lib/solana/tokens"),
      import("@/lib/solana/transfer"),
      import("@/lib/services/billing.service"),
      import("@/lib/integrations/dodo/webhook"),
      import("@/lib/services/metrics.service"),
      import("@/lib/services/reconciliation.service"),
    ]);

    const contractorWallet = required("E2E_CONTRACTOR_WALLET");
    const secondContractorWallet = required("E2E_SECOND_CONTRACTOR_WALLET");
    const feeWallet = required("E2E_FEE_WALLET");
    const runId = `e2e_${Date.now()}`;
    const company = await prisma.company.create({
      data: {
        id: `company_${runId}`,
        name: "Devnet E2E Payroll Co",
        treasuryWalletAddress: process.env.TREASURY_WALLET_ADDRESS,
      },
    });

    const beforeTreasury = await getTreasuryBalance(process.env.TREASURY_WALLET_ADDRESS);
    assert.ok(beforeTreasury > 0, "company treasury top-up must be visible on devnet before e2e runs");

    const contractor = await prisma.contractor.create({
      data: {
        id: `contractor_${runId}`,
        companyId: company.id,
        name: "Devnet Contractor",
        walletAddress: contractorWallet,
        kycStatus: "VERIFIED",
      },
    });
    const invoice = await createInvoice({
      companyId: company.id,
      contractorId: contractor.id,
      amountUsdc: Number(process.env.E2E_ESCROW_AMOUNT_USDC ?? "0.10"),
      workPeriodStart: "2026-05-01",
      workPeriodEnd: "2026-05-10",
      lineItems: [{ description: "E2E payroll validation", quantity: 1, unitPrice: 0.1 }],
    });
    assert.equal(invoice.status, "PENDING");

    const approved = await approveInvoice({ invoiceId: invoice.id, adminId: "devnet-e2e" });
    assert.equal(approved.status, "APPROVED");

    const beforeContractor = await tokenBalance(contractorWallet);
    const payout = await executePayout({
      invoiceId: invoice.id,
      wallet: contractorWallet,
      amount: Number(invoice.amountUsdc),
      companyId: company.id,
    });
    assert.equal(payout.status, "CONFIRMED");
    await assertExplorerTransaction(payout.txHash);

    const escrow = await getEscrowStatus(invoice.id);
    assert.equal(escrow.exists, true);
    assert.equal(escrow.isReleased, true);

    const afterContractor = await tokenBalance(contractorWallet);
    assert.ok(afterContractor > beforeContractor, "contractor balance should increase after escrow release");

    const paidInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    const dbPayout = await prisma.payout.findUnique({ where: { invoiceId: invoice.id } });
    assert.equal(paidInvoice?.status, "PAID");
    assert.equal(dbPayout?.txSignature, payout.txHash);

    const split = await transferWithSplit({
      contractorWallet,
      feeWallet,
      amount: process.env.E2E_SPLIT_AMOUNT_USDC ?? "0.10",
    });
    await assertExplorerTransaction(split.signature);

    const batch = await executeBatchPayout([
      { wallet: contractorWallet, amount: Number(process.env.E2E_BATCH_AMOUNT_USDC ?? "0.05") },
      { wallet: secondContractorWallet, amount: Number(process.env.E2E_BATCH_AMOUNT_USDC ?? "0.05") },
    ]);
    await assertExplorerTransaction(batch.signature);

    const dodoSecret = process.env.DODO_WEBHOOK_SECRET ?? "devnet-e2e-secret";
    process.env.DODO_WEBHOOK_SECRET = dodoSecret;
    const dodoPayload = JSON.stringify({
      id: `dodo_${runId}`,
      type: "payment.succeeded",
      data: {
        dodoPaymentId: `payment_${runId}`,
        companyId: company.id,
        customerId: `customer_${runId}`,
        subscriptionId: `subscription_${runId}`,
        customerEmail: "finance@example.com",
        amountUsd: "49.00",
        currency: "USD",
        plan: "growth",
      },
    });
    const billing = await handleDodoWebhook({
      payload: dodoPayload,
      signature: signDodoPayload(dodoPayload, dodoSecret),
      skipFreshnessCheck: true,
    });
    assert.equal(billing.processed, true);

    const heliusSignature = process.env.E2E_HELIUS_TOPUP_SIGNATURE ?? payout.txHash;
    const processedTreasury = await processHeliusTreasuryWebhook({
      signature: heliusSignature,
      slot: 1,
      tokenTransfers: [
        {
          mint: DEVNET_USDC_MINT.toBase58(),
          fromUserAccount: contractorWallet,
          toUserAccount: process.env.TREASURY_WALLET_ADDRESS,
          tokenAmount: 0.01,
        },
      ],
    });
    assert.ok(processedTreasury.length >= 1, "Helius treasury sync should reconcile at least one transfer");

    const metrics = await getSystemMetrics(company.id);
    assert.ok(metrics.payouts.successRate > 0);
    assert.ok(metrics.treasury.wallets.length >= 1);

    const reconciliation = await getReconciliationReport(company.id);
    assert.equal(reconciliation.summary.critical, 0);
  });
});
