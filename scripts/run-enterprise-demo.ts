import "dotenv/config";

import { prisma } from "@/lib/db/prisma";
import { createInvoice, approveInvoice } from "@/lib/services/invoice.service";
import { executePayout } from "@/lib/services/payout.service";
import { writeJsonArtifact } from "./phase4-common";

const db = prisma as any;

async function main(): Promise<void> {
  const runId = `demo_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const organizationId = `org_${runId}`;
  const companyId = `company_${runId}`;

  const treasuryWalletAddress = process.env.TEST_COMPANY_WALLET;
  const contractorWallet = process.env.TEST_CONTRACTOR_WALLET;

  if (!treasuryWalletAddress || !contractorWallet) {
    throw new Error("TEST_COMPANY_WALLET and TEST_CONTRACTOR_WALLET are required for enterprise demo seeding.");
  }

  await db.organization.create({
    data: {
      id: organizationId,
      name: "Acme Global Holdings",
      slug: `acme-global-${runId}`,
    },
  });

  await db.company.create({
    data: {
      id: companyId,
      organizationId,
      name: "Acme Borderless Payroll",
      planTier: "Enterprise",
      treasuryWalletAddress,
      feeWalletAddress: process.env.TEST_FEE_WALLET ?? treasuryWalletAddress,
      treasuryBalanceUsdc: "100000.00",
      treasuryBalanceUpdatedAt: new Date(),
    },
  });

  const contractors = await Promise.all(
    Array.from({ length: 8 }).map((_, idx) =>
      db.contractor.create({
        data: {
          id: `contractor_${runId}_${idx + 1}`,
          organizationId,
          companyId,
          name: `Enterprise Contractor ${idx + 1}`,
          email: `enterprise.${idx + 1}.${runId}@example.com`,
          country: idx % 2 === 0 ? "India" : "Singapore",
          taxId: `TAX-${runId}-${idx + 1}`,
          walletAddress: contractorWallet,
          payoutPreference: "USDC",
          kycStatus: "VERIFIED",
        },
      }),
    ),
  );

  const invoices = [] as any[];
  for (let idx = 0; idx < 20; idx += 1) {
    const contractor = contractors[idx % contractors.length];
    const invoice = await createInvoice({
      companyId,
      contractorId: contractor.id,
      amountUsdc: 150 + idx * 10,
      workPeriodStart: "2026-05-01",
      workPeriodEnd: "2026-05-10",
      lineItems: [{ description: `Enterprise sprint ${idx + 1}`, quantity: 1, unitPrice: 150 + idx * 10 }],
      notes: `enterprise-demo-${runId}-${idx + 1}`,
    });
    invoices.push(invoice);
  }

  const runRealPayout = process.env.RUN_REAL_DEMO_PAYOUT === "1";
  const payouts = [] as Array<Record<string, unknown>>;

  if (runRealPayout) {
    const sampleInvoices = invoices.slice(0, 2);
    for (const invoice of sampleInvoices) {
      await approveInvoice({ invoiceId: invoice.id, adminId: `demo-admin-${runId}` });
      const payout = await executePayout({
        invoiceId: invoice.id,
        wallet: contractorWallet,
        amount: Number(invoice.amountUsdc),
        companyId,
      });
      payouts.push({ invoiceId: invoice.id, payoutId: payout.payoutId, txSignature: payout.txHash });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runId,
    organizationId,
    companyId,
    seeded: {
      contractors: contractors.length,
      invoices: invoices.length,
      realPayoutsExecuted: payouts.length,
    },
    wallets: {
      treasuryWalletAddress,
      contractorWallet,
      feeWalletAddress: process.env.TEST_FEE_WALLET ?? treasuryWalletAddress,
    },
    payouts,
  };

  await writeJsonArtifact("artifacts/enterprise-demo-seed-report.json", report);
  console.info("[phase5] Enterprise demo environment seeded", report.seeded);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase5] run-enterprise-demo failed: ${message}`);
  process.exitCode = 1;
});
