import { prisma } from "../db/prisma";
import { getBillingPlan, getBillingPlanByProductId, resolveBillingPlanProductId } from "@/lib/billing/plans";
import {
  normalizeDodoStatus,
  parseDodoWebhook,
  verifyDodoSignature,
  type DodoWebhookEvent,
} from "../integrations/dodo/webhook";
import {
  createDodoPortalSession,
  createHostedCheckout,
  fetchDodoCheckoutSession,
  fetchDodoSubscription,
  reportDodoUsageEvents,
} from "@/lib/payments/dodo-client";

const db = prisma as any;

export type CheckoutSession = {
  url: string;
  customerId: string;
  subscriptionId: string;
  sessionId?: string;
};

export type UsageReport = {
  success: boolean;
  usageEventId: string;
};

export type BillingReconciliation = {
  status: string;
  subscriptionId: string | null;
  customerId: string | null;
  planTier: string | null;
  paymentId: string | null;
  checkoutSessionId: string | null;
  discrepancies: string[];
  lastSyncAt: Date;
};

export type DodoReturnParams = Record<string, string | null | undefined>;

export type BillingAccountUpdate = {
  eventId: string;
  companyId: string;
  status: string;
  subscriptionId?: string;
  customerId?: string;
  plan?: string;
  processed: boolean;
};

export async function createCheckoutSession({
  companyId,
  tier,
  origin,
}: {
  companyId: string;
  tier: string;
  origin?: string;
}): Promise<CheckoutSession> {
  const plan = getBillingPlan(tier);
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { id: true, organizationId: true, name: true, dodoCustomerId: true },
  });

  if (!company) {
    throw new Error("Company not found.");
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? origin ?? process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
  const checkout = await createHostedCheckout({
    productId: resolveBillingPlanProductId(plan),
    customerId: company.dodoCustomerId,
    customer: { name: company.name },
    returnUrl: `${appUrl}/onboarding?billing_return=1&checkout=${encodeURIComponent(plan.tier)}&provider=dodo`,
    cancelUrl: `${appUrl}/onboarding?billing_cancelled=1&checkout=${encodeURIComponent(plan.tier)}&provider=dodo`,
    metadata: {
      companyId,
      organizationId: company.organizationId ?? null,
      selectedPlan: plan.tier,
    },
  });

  await db.company.update({
    where: { id: companyId },
    data: {
      planTier: plan.displayName,
      dodoCheckoutSessionId: checkout.sessionId || null,
      billingStatus: "pending",
      subscriptionUpdatedAt: new Date(),
    },
  }).catch(() => undefined);

  return {
    url: checkout.checkoutUrl,
    customerId: company.dodoCustomerId ?? "",
    subscriptionId: "",
    sessionId: checkout.sessionId,
  };
}

export async function reportUsageUnit({
  companyId,
  eventType,
  referenceId,
}: {
  companyId: string;
  eventType: "invoice" | "payout" | "fx_quote" | "payroll_run" | "contractor_count" | "invoice_volume" | "treasury_operation";
  referenceId?: string;
}): Promise<UsageReport> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true, dodoCustomerId: true },
  });

  if (!company?.dodoCustomerId) {
    throw new Error("[dodo] Company does not have a Dodo customer ID for usage reporting.");
  }

  const usageEventId = referenceId
    ? `${companyId}:${eventType}:${referenceId}`
    : `${companyId}:${eventType}:${crypto.randomUUID()}`;

  const usage = await reportDodoUsageEvents([
    {
      eventId: usageEventId,
      customerId: company.dodoCustomerId,
      eventName: eventType,
      timestamp: new Date().toISOString(),
      metadata: {
        companyId,
        referenceId: referenceId ?? null,
        units: 1,
      },
    },
  ]);

  await db.usageEvent.create({
    data: {
      organizationId: company?.organizationId ?? null,
      companyId,
      eventType,
      dodoEventId: usageEventId,
      lastReportedUsage: { units: 1, referenceId: referenceId ?? null },
      usageSyncedAt: new Date(),
    },
  }).catch(() => undefined);

  return {
    success: usage.ingestedCount > 0,
    usageEventId,
  };
}

function decimalString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "0";
}

function dodoPaymentId(event: DodoWebhookEvent): string {
  return (
    event.data.dodoPaymentId ??
    event.data.paymentId ??
    event.data.id ??
    event.id
  );
}

export async function handleDodoWebhook({
  payload,
  signature,
  webhookId,
  webhookTimestamp,
  skipFreshnessCheck = false,
}: {
  payload: string;
  signature: string | null;
  webhookId?: string | null;
  webhookTimestamp?: string | null;
  skipFreshnessCheck?: boolean;
}): Promise<BillingAccountUpdate> {
  if (!skipFreshnessCheck && process.env.NODE_ENV === "production" && !signature) {
    throw new Error("Dodo webhook signature is required.");
  }

  if (!verifyDodoSignature(payload, signature, process.env.DODO_WEBHOOK_SECRET, { webhookId, webhookTimestamp })) {
    throw new Error("Invalid Dodo webhook signature.");
  }

  const event: DodoWebhookEvent = parseDodoWebhook(payload);
  const rawPayload = JSON.parse(payload) as Record<string, unknown>;
  const status = normalizeDodoStatus(event);
  const paymentId = dodoPaymentId(event);
  const companyId = event.data.companyId ?? (rawPayload.metadata as any)?.companyId;
  const selectedPlan = event.data.plan ?? (rawPayload.metadata as any)?.selectedPlan;
  const subscriptionId = event.data.subscriptionId ?? event.data.subscription_id ?? (rawPayload.subscription_id as string | undefined);
  const customerId = event.data.customerId ?? (rawPayload.customer_id as string | undefined) ?? (rawPayload.customer as any)?.customer_id;
  const productId = event.data.productId ?? event.data.product_id ?? (rawPayload.product_id as string | undefined);
  const planFromProduct = getBillingPlanByProductId(productId);
  const company =
    companyId
      ? await db.company.findUnique({
          where: { id: companyId },
          select: { id: true, organizationId: true },
        })
      : null;

  const existingWebhook = await db.webhookEvent.findUnique({
    where: {
      provider_externalId: {
        provider: "dodo",
        externalId: event.id,
      },
    },
  });

  if (existingWebhook?.processed) {
    return {
      eventId: event.id,
      companyId: event.data.companyId ?? "unknown",
      status,
      subscriptionId: event.data.subscriptionId,
      customerId: event.data.customerId,
      plan: event.data.plan,
      processed: true,
    };
  }

  const webhook = await db.webhookEvent.upsert({
    where: {
      provider_externalId: {
        provider: "dodo",
        externalId: event.id,
      },
    },
    create: {
      organizationId: company?.organizationId ?? null,
      companyId: company?.id ?? null,
      provider: "dodo",
      externalId: event.id,
      eventType: event.type,
      signature,
      payload: rawPayload,
      processed: false,
    },
    update: {
      organizationId: company?.organizationId ?? null,
      companyId: company?.id ?? null,
      eventType: event.type,
      signature,
      payload: rawPayload,
      processed: false,
      processedAt: null,
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await (tx as any).billingEvent.upsert({
        where: { dodoPaymentId: paymentId },
        create: {
          organizationId: company?.organizationId ?? null,
          companyId: company?.id,
          dodoPaymentId: paymentId,
          customerEmail: event.data.customerEmail,
          amountUsd: decimalString(event.data.amountUsd ?? event.data.amount),
          currency: event.data.currency ?? "USD",
          status,
          rawPayload,
        },
        update: {
          organizationId: company?.organizationId ?? null,
          companyId: company?.id,
          customerEmail: event.data.customerEmail,
          amountUsd: decimalString(event.data.amountUsd ?? event.data.amount),
          currency: event.data.currency ?? "USD",
          status,
          rawPayload,
        },
      });

      if (company?.id && (customerId || subscriptionId || selectedPlan || planFromProduct)) {
        await (tx as any).company.update({
          where: { id: company.id },
          data: {
            ...(customerId ? { dodoCustomerId: customerId } : {}),
            ...(subscriptionId ? { dodoSubscriptionId: subscriptionId } : {}),
            ...(paymentId ? { dodoPaymentId: paymentId } : {}),
            ...(selectedPlan || planFromProduct ? { planTier: planFromProduct?.displayName ?? selectedPlan } : {}),
            billingStatus: status === "paid" ? "active" : status,
            subscriptionUpdatedAt: new Date(),
            webhookLastReceivedAt: new Date(),
          },
        });
      }

      await (tx as any).webhookEvent.update({
        where: { id: webhook.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    });
  } catch (error) {
    console.error("[billing:dodo:webhook] Processing failed", {
      eventId: event.id,
      eventType: event.type,
      paymentId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  return {
    eventId: event.id,
    companyId: companyId ?? "unknown",
    status,
    subscriptionId,
    customerId,
    plan: planFromProduct?.displayName ?? selectedPlan,
    processed: true,
  };
}

function firstParam(params: DodoReturnParams | undefined, names: string[]): string | null {
  if (!params) return null;
  for (const name of names) {
    const value = params[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isPaidReturnStatus(status?: string | null): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === "succeeded" || normalized === "paid" || normalized === "active" || normalized === "trialing" || normalized === "success";
}

function isFailedReturnStatus(status?: string | null): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === "failed" || normalized === "cancelled" || normalized === "canceled";
}

async function syncDodoCheckoutReturn({
  company,
  params,
  discrepancies,
}: {
  company: any;
  params?: DodoReturnParams;
  discrepancies: string[];
}): Promise<{
  status: string | null;
  planTier: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  paymentId: string | null;
  checkoutSessionId: string | null;
}> {
  const selectedPlanValue = firstParam(params, ["checkout", "selectedPlan", "selected_plan", "plan", "planTier"]) ?? company.planTier;
  let selectedPlan: ReturnType<typeof getBillingPlan> | null = null;
  if (selectedPlanValue) {
    try {
      selectedPlan = getBillingPlan(selectedPlanValue);
    } catch {
      selectedPlan = null;
    }
  }
  const checkoutSessionId =
    firstParam(params, ["checkout_session_id", "checkoutSessionId", "session_id", "sessionId", "checkout_id", "id"]) ??
    company.dodoCheckoutSessionId ??
    null;
  let paymentStatus = firstParam(params, ["payment_status", "paymentStatus", "status", "billing_status"]);
  let paymentId = firstParam(params, ["payment_id", "paymentId", "dodo_payment_id", "dodoPaymentId"]) ?? company.dodoPaymentId ?? null;
  let subscriptionId = firstParam(params, ["subscription_id", "subscriptionId", "dodo_subscription_id"]) ?? company.dodoSubscriptionId ?? null;
  let customerId = firstParam(params, ["customer_id", "customerId", "dodo_customer_id"]) ?? company.dodoCustomerId ?? null;
  let customerEmail = firstParam(params, ["customer_email", "customerEmail"]);

  if (checkoutSessionId) {
    try {
      const checkoutSession = await fetchDodoCheckoutSession(checkoutSessionId);
      paymentStatus = checkoutSession.paymentStatus ?? paymentStatus;
      paymentId = checkoutSession.paymentId ?? paymentId;
      customerEmail = checkoutSession.customerEmail ?? customerEmail;
    } catch (error) {
      discrepancies.push(`Unable to fetch Dodo checkout session ${checkoutSessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const paid = isPaidReturnStatus(paymentStatus) || Boolean(paymentId && !isFailedReturnStatus(paymentStatus));
  const failed = isFailedReturnStatus(paymentStatus);
  const nextStatus = paid ? "active" : failed ? "failed" : null;

  if (nextStatus) {
    await db.company.update({
      where: { id: company.id },
      data: {
        billingStatus: nextStatus,
        ...(selectedPlan ? { planTier: selectedPlan.displayName } : {}),
        ...(checkoutSessionId ? { dodoCheckoutSessionId: checkoutSessionId } : {}),
        ...(paymentId ? { dodoPaymentId: paymentId } : {}),
        ...(subscriptionId ? { dodoSubscriptionId: subscriptionId } : {}),
        ...(customerId ? { dodoCustomerId: customerId } : {}),
        subscriptionUpdatedAt: new Date(),
      },
    });

    if (paymentId) {
      await db.billingEvent.upsert({
        where: { dodoPaymentId: paymentId },
        create: {
          organizationId: company.organizationId ?? null,
          companyId: company.id,
          dodoPaymentId: paymentId,
          customerEmail,
          amountUsd: "0",
          currency: "USD",
          status: paid ? "paid" : "failed",
          rawPayload: {
            source: "checkout_return_reconciliation",
            checkoutSessionId,
            paymentStatus,
            returnParams: params ?? {},
          },
        },
        update: {
          organizationId: company.organizationId ?? null,
          companyId: company.id,
          customerEmail,
          status: paid ? "paid" : "failed",
          rawPayload: {
            source: "checkout_return_reconciliation",
            checkoutSessionId,
            paymentStatus,
            returnParams: params ?? {},
          },
        },
      }).catch(() => undefined);
    }
  }

  return {
    status: nextStatus,
    planTier: selectedPlan?.displayName ?? company.planTier,
    customerId,
    subscriptionId,
    paymentId,
    checkoutSessionId,
  };
}

export async function reconcileBillingState(companyId: string, returnParams?: DodoReturnParams): Promise<BillingReconciliation> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      organizationId: true,
      planTier: true,
      dodoCustomerId: true,
      dodoSubscriptionId: true,
      dodoCheckoutSessionId: true,
      dodoPaymentId: true,
      billingStatus: true,
    },
  });

  if (!company) {
    throw new Error("Company not found.");
  }

  const discrepancies: string[] = [];
  let liveSubscription = null as Awaited<ReturnType<typeof fetchDodoSubscription>> | null;

  if (company.dodoSubscriptionId) {
    liveSubscription = await fetchDodoSubscription(company.dodoSubscriptionId);
    const normalizedStatus = liveSubscription.status === "on_hold" ? "failed" : liveSubscription.status;
    const plan = getBillingPlanByProductId(liveSubscription.productId);

    if (company.billingStatus && company.billingStatus !== normalizedStatus) {
      discrepancies.push(`Local billing status ${company.billingStatus} differs from Dodo status ${normalizedStatus}.`);
    }
    if (plan && company.planTier !== plan.displayName) {
      discrepancies.push(`Local plan ${company.planTier ?? "unset"} differs from Dodo product ${plan.displayName}.`);
    }

    await db.company.update({
      where: { id: companyId },
      data: {
        billingStatus: normalizedStatus,
        ...(liveSubscription.customerId ? { dodoCustomerId: liveSubscription.customerId } : {}),
        ...(plan ? { planTier: plan.displayName } : {}),
        subscriptionUpdatedAt: new Date(),
      },
    });

    return {
      status: normalizedStatus,
      subscriptionId: liveSubscription.subscriptionId,
      customerId: liveSubscription.customerId ?? company.dodoCustomerId,
      planTier: plan?.displayName ?? company.planTier,
      paymentId: company.dodoPaymentId,
      checkoutSessionId: company.dodoCheckoutSessionId,
      discrepancies,
      lastSyncAt: new Date(),
    };
  }

  const checkoutReturn = await syncDodoCheckoutReturn({ company, params: returnParams, discrepancies });

  if (!checkoutReturn.status && company.dodoCustomerId) {
    discrepancies.push("Dodo customer exists but no subscription has been confirmed yet.");
  }

  return {
    status: checkoutReturn.status ?? company.billingStatus ?? (company.dodoCustomerId || company.dodoCheckoutSessionId ? "pending" : "uninitialized"),
    subscriptionId: checkoutReturn.subscriptionId,
    customerId: checkoutReturn.customerId,
    planTier: checkoutReturn.planTier,
    paymentId: checkoutReturn.paymentId,
    checkoutSessionId: checkoutReturn.checkoutSessionId,
    discrepancies,
    lastSyncAt: new Date(),
  };
}

export async function createBillingPortalSession(companyId: string, returnUrl?: string): Promise<{ url: string }> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { dodoCustomerId: true },
  });

  if (!company?.dodoCustomerId) {
    throw new Error("[dodo] Company does not have a Dodo customer ID.");
  }

  const session = await createDodoPortalSession({
    customerId: company.dodoCustomerId,
    returnUrl,
  });

  await db.company.update({
    where: { id: companyId },
    data: { billingPortalUrl: session.link },
  }).catch(() => undefined);

  return { url: session.link };
}
