import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { toHttpErrorResponse } from "@/lib/auth/http";

const db = prisma as any;

function validateEnv(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const requiredVars = ["DODO_API_KEY", "DODO_WEBHOOK_SECRET", "DODO_BASE_URL", "NEXT_PUBLIC_APP_URL"];
  for (const varName of requiredVars) {
    if (!process.env[varName]?.trim()) {
      errors.push(`${varName} is required but missing or empty`);
    }
  }

  if (process.env.DODO_API_BASE_URL?.trim() && !process.env.DODO_BASE_URL?.trim()) {
    warnings.push("DODO_API_BASE_URL is deprecated; use DODO_BASE_URL");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function getDodoApiUrl(): string {
  return process.env.DODO_BASE_URL?.trim() || process.env.DODO_API_BASE_URL?.trim() || "https://api.dodopayments.com";
}

async function testDodoConnectivity(): Promise<{
  reachable: boolean;
  statusCode?: number;
  error?: string;
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const apiKey = process.env.DODO_API_KEY?.trim();
    if (!apiKey) {
      return { reachable: false, error: "DODO_API_KEY not set", latencyMs: 0 };
    }

    const response = await fetch(`${getDodoApiUrl().replace(/\/+$/, "")}/customers?page_size=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    }).catch((err) => {
      throw new Error(`Fetch failed: ${err.message}`);
    });

    const latencyMs = Date.now() - start;
    return {
      reachable: response.ok,
      statusCode: response.status,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
      latencyMs,
    };
  }
}

async function getCompanyBillingState(companyId: string): Promise<{
  company: any;
  billing: any;
  webhooks: any;
  reconciliation: any;
}> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      planTier: true,
      dodoCustomerId: true,
      dodoSubscriptionId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const [billingEvents, webhookEvents, usageEvents] = await Promise.all([
    db.billingEvent.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.webhookEvent.findMany({
      where: { companyId, provider: "dodo" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.usageEvent.findMany({
      where: { companyId },
      orderBy: { reportedAt: "desc" },
      take: 10,
    }),
  ]);

  const latestBillingEvent = billingEvents[0];
  const latestWebhook = webhookEvents[0];
  const webhooksRecent = webhookEvents.filter(
    (wh: any) =>
      wh.processed &&
      Date.now() - new Date(wh.processedAt).getTime() < 7 * 24 * 60 * 60 * 1000,
  );

  return {
    company,
    billing: {
      status:
        latestBillingEvent?.status ||
        (company.dodoSubscriptionId ? "active" : "pending"),
      customerId: company.dodoCustomerId || null,
      subscriptionId: company.dodoSubscriptionId || null,
      latestPaymentId: latestBillingEvent?.dodoPaymentId || null,
      latestPaymentAmount: latestBillingEvent?.amountUsd || null,
      latestPaymentAt: latestBillingEvent?.createdAt || null,
      recentPayments: billingEvents,
    },
    webhooks: {
      totalReceived: webhookEvents.length,
      totalProcessed: webhookEvents.filter((wh: any) => wh.processed).length,
      recentWithin7Days: webhooksRecent.length,
      lastWebhookAt: latestWebhook?.createdAt || null,
      lastWebhookProcessedAt: latestWebhook?.processedAt || null,
      recentWebhooks: webhookEvents,
    },
    reconciliation: {
      hasCustomerId: Boolean(company.dodoCustomerId),
      hasSubscriptionId: Boolean(company.dodoSubscriptionId),
      hasRecentWebhook:
        latestWebhook &&
        Date.now() - new Date(latestWebhook.createdAt).getTime() <
          60 * 60 * 1000,
      webhooksSynced:
        webhooksRecent.length > 0
          ? "Yes (within 7 days)"
          : webhookEvents.length > 0
            ? "Stale"
            : "No webhooks received",
      expectedState:
        company.dodoCustomerId && company.dodoSubscriptionId
          ? "ACTIVE"
          : "PENDING_WEBHOOK",
      actualPaymentState:
        latestBillingEvent?.status || (company.dodoSubscriptionId ? "active" : "unknown"),
      isReconciled:
        company.dodoSubscriptionId &&
        latestBillingEvent &&
        latestBillingEvent.status === "paid",
      usageEventsCount: usageEvents.length,
      usageEventsSyncedRecently: usageEvents.filter(
        (ue: any) =>
          Date.now() - new Date(ue.reportedAt).getTime() < 7 * 24 * 60 * 60 * 1000,
      ).length,
    },
  };
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);

    const envValidation = validateEnv();
    const connectivity = await testDodoConnectivity();
    const companyState = await getCompanyBillingState(admin.companyId);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      admin: {
        userId: admin.userId,
        companyId: admin.companyId,
      },
      environment: {
        valid: envValidation.valid,
        errors: envValidation.errors,
        warnings: envValidation.warnings,
        apiBaseUrl: getDodoApiUrl(),
        nodeEnv: process.env.NODE_ENV,
      },
      connectivity: {
        reachable: connectivity.reachable,
        statusCode: connectivity.statusCode,
        latencyMs: connectivity.latencyMs,
        error: connectivity.error,
      },
      company: companyState,
      actionItems: generateActionItems(envValidation, connectivity, companyState),
    });
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}

function cleanActionItem(item: string): string {
  return item.replace(/[^\x20-\x7E]+/g, "").trim();
}

function generateActionItems(
  envValidation: any,
  connectivity: any,
  companyState: any,
): string[] {
  const items: string[] = [];

  if (!envValidation.valid) {
    items.push("❌ Fix missing environment variables");
  }

  if (envValidation.warnings.length > 0) {
    items.push("⚠️ Address environment warnings");
  }

  if (!connectivity.reachable) {
    items.push("❌ Dodo API is unreachable; check connectivity and credentials");
  }

  if (connectivity.latencyMs > 5000) {
    items.push("⚠️ Dodo API latency is high (>5s); may affect checkout flow");
  }

  const { company, webhooks, reconciliation } = companyState;

  if (!company.planTier) {
    items.push("⚠️ No plan tier selected; user should complete onboarding");
  }

  if (!company.dodoCustomerId) {
    items.push("⚠️ No Dodo customer ID; checkout session was not created or failed");
  }

  if (!company.dodoSubscriptionId) {
    items.push(
      "⚠️ No Dodo subscription ID; webhook has not confirmed payment or checkout incomplete",
    );
  }

  if (webhooks.totalReceived === 0) {
    items.push("❌ No Dodo webhooks received; check webhook URL configuration");
  } else if (webhooks.totalProcessed === 0) {
    items.push("❌ Dodo webhooks received but NOT processed; check signature verification");
  } else if (webhooks.recentWithin7Days === 0) {
    items.push("⚠️ No recent webhook activity (>7 days); subscription may be stale");
  }

  if (!reconciliation.isReconciled) {
    if (company.dodoSubscriptionId && !company.dodoCustomerId) {
      items.push("⚠️ Subscription ID exists but no customer ID; DB is inconsistent");
    } else if (!company.dodoSubscriptionId && webhooks.totalReceived > 0) {
      items.push("🔄 Waiting for webhook to confirm subscription; may be in-flight");
    }
  }

  if (items.length === 0) {
    items.push("Billing integration appears healthy; no immediate action required");
  }

  return items.length > 0
    ? items.map(cleanActionItem)
    : ["✅ Billing integration appears healthy; no immediate action required"];
}
