import "dotenv/config";

import { prisma } from "@/lib/db/prisma";
import { listInvoicesByCompany } from "@/lib/db/queries/invoices";
import { listPayoutsByCompany } from "@/lib/db/queries/payouts";
import { writeJsonArtifact } from "./phase4-common";

const db = prisma as any;

async function main(): Promise<void> {
  const runId = `tenant_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const organizationId = `org_${runId}`;

  await db.organization.create({
    data: {
      id: organizationId,
      name: `Tenant Org ${runId}`,
      slug: `tenant-org-${runId}`,
    },
  });

  const [companyA, companyB] = await Promise.all([
    db.company.create({
      data: {
        id: `company_a_${runId}`,
        organizationId,
        name: `Tenant A ${runId}`,
      },
    }),
    db.company.create({
      data: {
        id: `company_b_${runId}`,
        organizationId,
        name: `Tenant B ${runId}`,
      },
    }),
  ]);

  const contractorA = await db.contractor.create({
    data: {
      id: `contractor_a_${runId}`,
      organizationId,
      companyId: companyA.id,
      name: "Tenant A Contractor",
      email: `${runId}.a@example.com`,
      walletAddress: process.env.TEST_CONTRACTOR_WALLET ?? null,
      kycStatus: "VERIFIED",
    },
  });

  const contractorB = await db.contractor.create({
    data: {
      id: `contractor_b_${runId}`,
      organizationId,
      companyId: companyB.id,
      name: "Tenant B Contractor",
      email: `${runId}.b@example.com`,
      walletAddress: process.env.TEST_CONTRACTOR_WALLET ?? null,
      kycStatus: "VERIFIED",
    },
  });

  const [invoiceA, invoiceB] = await Promise.all([
    db.invoice.create({
      data: {
        id: `invoice_a_${runId}`,
        organizationId,
        companyId: companyA.id,
        contractorId: contractorA.id,
        amountUsdc: "100",
        status: "PAID",
      },
    }),
    db.invoice.create({
      data: {
        id: `invoice_b_${runId}`,
        organizationId,
        companyId: companyB.id,
        contractorId: contractorB.id,
        amountUsdc: "200",
        status: "PAID",
      },
    }),
  ]);

  await Promise.all([
    db.payout.create({
      data: {
        organizationId,
        companyId: companyA.id,
        contractorId: contractorA.id,
        invoiceId: invoiceA.id,
        contractorWallet: process.env.TEST_CONTRACTOR_WALLET ?? "11111111111111111111111111111111",
        amountUsdc: "100",
        currency: "USDC",
        status: "CONFIRMED",
        txSignature: `tenant_tx_a_${runId}`,
      },
    }),
    db.payout.create({
      data: {
        organizationId,
        companyId: companyB.id,
        contractorId: contractorB.id,
        invoiceId: invoiceB.id,
        contractorWallet: process.env.TEST_CONTRACTOR_WALLET ?? "11111111111111111111111111111111",
        amountUsdc: "200",
        currency: "USDC",
        status: "CONFIRMED",
        txSignature: `tenant_tx_b_${runId}`,
      },
    }),
  ]);

  const [companyAInvoices, companyBInvoices, companyAPayouts, companyBPayouts] = await Promise.all([
    listInvoicesByCompany(companyA.id),
    listInvoicesByCompany(companyB.id),
    listPayoutsByCompany(companyA.id),
    listPayoutsByCompany(companyB.id),
  ]);

  const leakage = {
    invoiceLeakage:
      companyAInvoices.some((item) => item.id === invoiceB.id) ||
      companyBInvoices.some((item) => item.id === invoiceA.id),
    payoutLeakage:
      companyAPayouts.some((item) => item.invoiceId === invoiceB.id) ||
      companyBPayouts.some((item) => item.invoiceId === invoiceA.id),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    runId,
    organizationId,
    checks: {
      companyAInvoiceCount: companyAInvoices.length,
      companyBInvoiceCount: companyBInvoices.length,
      companyAPayoutCount: companyAPayouts.length,
      companyBPayoutCount: companyBPayouts.length,
      leakage,
    },
    passed: !leakage.invoiceLeakage && !leakage.payoutLeakage,
  };

  await writeJsonArtifact("artifacts/tenant-isolation-report.json", report);

  if (!report.passed) {
    throw new Error("Cross-tenant leakage detected in invoice/payout queries.");
  }

  console.info("[phase5] Tenant isolation verification passed", report.checks);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase5] verify-tenant-isolation failed: ${message}`);
  process.exitCode = 1;
});
