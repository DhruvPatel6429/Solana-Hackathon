import "dotenv/config";

import { performance } from "node:perf_hooks";

import { prisma } from "@/lib/db/prisma";
import { createInvoice } from "@/lib/services/invoice.service";
import { handleDodoWebhook } from "@/lib/services/billing.service";
import { processHeliusTreasuryWebhook } from "@/lib/services/treasury.service";
import { getSystemHealth, getSystemMetrics } from "@/lib/services/metrics.service";
import { getReconciliationReport } from "@/lib/services/reconciliation.service";
import { signDodoPayload } from "@/lib/integrations/dodo/webhook";
import { writeJsonArtifact } from "./phase4-common";

const db = prisma as any;

type Stat = {
  name: string;
  operations: number;
  durationMs: number;
  avgMs: number;
  p95Ms: number;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

async function measureBatch<T>(name: string, operations: Array<() => Promise<T>>): Promise<Stat> {
  const latencies: number[] = [];
  const start = performance.now();

  for (const operation of operations) {
    const opStart = performance.now();
    await operation();
    latencies.push(performance.now() - opStart);
  }

  const durationMs = performance.now() - start;

  return {
    name,
    operations: operations.length,
    durationMs,
    avgMs: operations.length === 0 ? 0 : durationMs / operations.length,
    p95Ms: percentile(latencies, 95),
  };
}

async function main(): Promise<void> {
  const runId = `load_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const organizationId = `org_${runId}`;
  const companyId = `company_${runId}`;

  const invoiceTarget = Number(process.env.LOADTEST_INVOICES ?? "1000");
  const payoutTarget = Number(process.env.LOADTEST_PAYOUTS ?? "500");
  const batchTarget = Number(process.env.LOADTEST_BATCHES ?? "100");
  const webhookStormTarget = Number(process.env.LOADTEST_WEBHOOK_EVENTS ?? "200");
  const dashboardConcurrency = Number(process.env.LOADTEST_DASHBOARD_REQUESTS ?? "100");

  await db.organization.create({
    data: {
      id: organizationId,
      name: `Load Test Org ${runId}`,
      slug: `load-test-${runId}`,
    },
  });

  await db.company.create({
    data: {
      id: companyId,
      organizationId,
      name: `Load Test Co ${runId}`,
      planTier: "Enterprise",
    },
  });

  const contractors = await Promise.all(
    Array.from({ length: 20 }).map((_, index) =>
      db.contractor.create({
        data: {
          id: `contractor_${runId}_${index + 1}`,
          organizationId,
          companyId,
          name: `Contractor ${index + 1}`,
          email: `${runId}_${index + 1}@example.com`,
          walletAddress: process.env.TEST_CONTRACTOR_WALLET ?? null,
          kycStatus: "VERIFIED",
        },
      }),
    ),
  );

  const invoiceOps = Array.from({ length: invoiceTarget }).map((_, idx) => async () => {
    const contractor = contractors[idx % contractors.length];
    await createInvoice({
      companyId,
      contractorId: contractor.id,
      amountUsdc: 10 + (idx % 50),
      workPeriodStart: "2026-05-01",
      workPeriodEnd: "2026-05-10",
      lineItems: [{ description: `Load item ${idx + 1}`, quantity: 1, unitPrice: 10 + (idx % 50) }],
      notes: `load-invoice-${runId}-${idx + 1}`,
    });
  });

  const invoiceStats = await measureBatch("invoice_creation", invoiceOps);

  const invoices = await db.invoice.findMany({
    where: { companyId },
    take: payoutTarget,
    orderBy: { createdAt: "asc" },
  });

  const payoutOps = invoices.map((invoice: any, idx: number) => async () => {
    await db.payout.upsert({
      where: { invoiceId: invoice.id },
      create: {
        organizationId,
        companyId,
        contractorId: invoice.contractorId,
        invoiceId: invoice.id,
        contractorWallet: process.env.TEST_CONTRACTOR_WALLET ?? "11111111111111111111111111111111",
        amountUsdc: invoice.amountUsdc,
        currency: "USDC",
        status: "CONFIRMED",
        txSignature: `load_tx_${runId}_${idx + 1}`,
        executedAt: new Date(),
      },
      update: {
        status: "CONFIRMED",
      },
    });

    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
      },
    });
  });

  const payoutStats = await measureBatch("payout_persistence", payoutOps);

  const batchOps = Array.from({ length: batchTarget }).map((_, idx) => async () => {
    await db.reconciliationAudit.create({
      data: {
        organizationId,
        companyId,
        scope: "BATCH_LOAD_TEST",
        entityType: "Batch",
        entityId: `${runId}_${idx + 1}`,
        severity: "INFO",
        status: "RESOLVED",
        expectedValue: "100",
        actualValue: "100",
        deltaValue: "0",
      },
    });
  });

  const batchStats = await measureBatch("batch_reconciliation_writes", batchOps);

  const dodoSecret = process.env.DODO_WEBHOOK_SECRET ?? "loadtest-secret";
  const webhookOps = Array.from({ length: webhookStormTarget }).map((_, idx) => async () => {
    const payload = JSON.stringify({
      id: `load_dodo_${runId}_${idx + 1}`,
      type: "payment.succeeded",
      data: {
        dodoPaymentId: `load_pay_${runId}_${idx + 1}`,
        companyId,
        customerEmail: `${runId}_${idx + 1}@example.com`,
        amountUsd: "5.00",
        currency: "USD",
      },
    });

    await handleDodoWebhook({
      payload,
      signature: signDodoPayload(payload, dodoSecret),
      skipFreshnessCheck: true,
    });
  });

  const webhookStats = await measureBatch("dodo_webhook_storm", webhookOps);

  const heliusOps = Array.from({ length: webhookStormTarget }).map((_, idx) => async () => {
    await processHeliusTreasuryWebhook([
      {
        signature: `load_helius_${runId}_${idx + 1}`,
        slot: idx + 1,
        tokenTransfers: [
          {
            mint: process.env.DEVNET_USDC_MINT ?? "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
            fromUserAccount: process.env.TEST_CONTRACTOR_WALLET,
            toUserAccount: null,
            tokenAmount: 1,
          },
        ],
      },
    ]);
  });

  const heliusStats = await measureBatch("helius_webhook_storm", heliusOps);

  const dashboardOps = Array.from({ length: dashboardConcurrency }).map(() => async () => {
    await Promise.all([
      getSystemMetrics(companyId),
      getSystemHealth(companyId),
      getReconciliationReport(companyId),
    ]);
  });

  const dashboardStats = await measureBatch("dashboard_concurrency", dashboardOps);

  const stats = [invoiceStats, payoutStats, batchStats, webhookStats, heliusStats, dashboardStats];

  const bottlenecks = stats
    .filter((entry) => entry.p95Ms > 50)
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .map((entry) => ({
      subsystem: entry.name,
      p95Ms: Number(entry.p95Ms.toFixed(2)),
      recommendation:
        entry.name.includes("webhook")
          ? "Introduce queue-backed webhook ingestion with batched DB writes and backpressure controls."
          : entry.name.includes("invoice")
            ? "Use bulk insertion for invoice ingestion and partition by organizationId/companyId."
            : entry.name.includes("dashboard")
              ? "Introduce caching layer for metrics/reconciliation endpoints."
              : "Review query plans and indexes for high-churn tables.",
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    runId,
    targets: {
      invoices: invoiceTarget,
      payouts: payoutTarget,
      batches: batchTarget,
      webhookEvents: webhookStormTarget,
      dashboardConcurrentRequests: dashboardConcurrency,
    },
    measurements: stats.map((entry) => ({
      ...entry,
      durationMs: Number(entry.durationMs.toFixed(2)),
      avgMs: Number(entry.avgMs.toFixed(2)),
      p95Ms: Number(entry.p95Ms.toFixed(2)),
    })),
    apiLatency: {
      dashboardP95Ms: Number(dashboardStats.p95Ms.toFixed(2)),
    },
    dbThroughput: {
      invoiceWritesPerSecond: Number((invoiceStats.operations / (invoiceStats.durationMs / 1000)).toFixed(2)),
      payoutWritesPerSecond: Number((payoutStats.operations / (payoutStats.durationMs / 1000)).toFixed(2)),
    },
    webhookProcessingSpeed: {
      dodoEventsPerSecond: Number((webhookStats.operations / (webhookStats.durationMs / 1000)).toFixed(2)),
      heliusEventsPerSecond: Number((heliusStats.operations / (heliusStats.durationMs / 1000)).toFixed(2)),
    },
    payoutExecutionTimes: {
      simulatedPersistenceP95Ms: Number(payoutStats.p95Ms.toFixed(2)),
    },
    dashboardResponsiveness: {
      averageMs: Number(dashboardStats.avgMs.toFixed(2)),
      p95Ms: Number(dashboardStats.p95Ms.toFixed(2)),
    },
    bottleneckAnalysis: bottlenecks,
    optimizationRecommendations: bottlenecks.map((item) => item.recommendation),
  };

  await writeJsonArtifact("artifacts/load-test-report.json", report);
  console.info("[phase5] Load test report generated", {
    file: "artifacts/load-test-report.json",
    bottlenecks: bottlenecks.length,
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase5] load-test-platform failed: ${message}`);
  process.exitCode = 1;
});
