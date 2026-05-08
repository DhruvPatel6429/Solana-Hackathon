import { createDodoCheckout, reportDodoUsage } from "../integrations/dodo/client";
import { parseDodoWebhook, verifyDodoSignature, type DodoWebhookEvent } from "../integrations/dodo/webhook";

export type CheckoutSession = {
  url: string;
  customerId: string;
  subscriptionId: string;
};

export type UsageReport = {
  success: boolean;
  usageEventId: string;
};

export type BillingAccountUpdate = {
  eventId: string;
  companyId: string;
  status: string;
  subscriptionId?: string;
  customerId?: string;
  plan?: string;
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
  const checkout = await createDodoCheckout({
    companyId,
    tier,
    successUrl: origin ? `${origin}/dashboard?billing=success` : undefined,
  });

  return {
    url: checkout.checkoutUrl,
    customerId: checkout.customerId,
    subscriptionId: checkout.subscriptionId,
  };
}

export async function reportUsageUnit({
  companyId,
  eventType,
  referenceId,
}: {
  companyId: string;
  eventType: "invoice" | "payout" | "fx_quote";
  referenceId?: string;
}): Promise<UsageReport> {
  return reportDodoUsage({
    companyId,
    eventType,
    referenceId,
    units: 1,
  });
}

export function handleDodoWebhook({
  payload,
  signature,
}: {
  payload: string;
  signature: string | null;
}): BillingAccountUpdate {
  if (!verifyDodoSignature(payload, signature)) {
    throw new Error("Invalid Dodo webhook signature.");
  }

  const event: DodoWebhookEvent = parseDodoWebhook(payload);

  return {
    eventId: event.id,
    companyId: event.data.companyId ?? "company_demo_01",
    status: event.data.status ?? statusFromEvent(event.type),
    subscriptionId: event.data.subscriptionId,
    customerId: event.data.customerId,
    plan: event.data.plan,
  };
}

function statusFromEvent(type: DodoWebhookEvent["type"]) {
  if (type === "subscription.cancelled") return "cancelled";
  if (type === "payment.succeeded") return "active";
  return "active";
}
