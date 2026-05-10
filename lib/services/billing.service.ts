import { prisma } from "../db/prisma";
import { createDodoCheckout, reportDodoUsage } from "../integrations/dodo/client";
import {
  normalizeDodoStatus,
  parseDodoWebhook,
  verifyDodoSignature,
  type DodoWebhookEvent,
} from "../integrations/dodo/webhook";

const db = prisma as any;

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
  skipFreshnessCheck = false,
}: {
  payload: string;
  signature: string | null;
  skipFreshnessCheck?: boolean;
}): Promise<BillingAccountUpdate> {
  if (!skipFreshnessCheck && process.env.NODE_ENV === "production" && !signature) {
    throw new Error("Dodo webhook signature is required.");
  }

  if (!verifyDodoSignature(payload, signature)) {
    throw new Error("Invalid Dodo webhook signature.");
  }

  const event: DodoWebhookEvent = parseDodoWebhook(payload);
  const rawPayload = JSON.parse(payload) as Record<string, unknown>;
  const status = normalizeDodoStatus(event);
  const paymentId = dodoPaymentId(event);

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
      provider: "dodo",
      externalId: event.id,
      eventType: event.type,
      signature,
      payload: rawPayload,
      processed: false,
    },
    update: {
      eventType: event.type,
      signature,
      payload: rawPayload,
      processed: false,
      processedAt: null,
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      const company = event.data.companyId
        ? await (tx as any).company.findUnique({
            where: { id: event.data.companyId },
            select: { id: true },
          })
        : null;

      await (tx as any).billingEvent.upsert({
        where: { dodoPaymentId: paymentId },
        create: {
          companyId: company?.id,
          dodoPaymentId: paymentId,
          customerEmail: event.data.customerEmail,
          amountUsd: decimalString(event.data.amountUsd ?? event.data.amount),
          currency: event.data.currency ?? "USD",
          status,
          rawPayload,
        },
        update: {
          companyId: company?.id,
          customerEmail: event.data.customerEmail,
          amountUsd: decimalString(event.data.amountUsd ?? event.data.amount),
          currency: event.data.currency ?? "USD",
          status,
          rawPayload,
        },
      });

      if (company?.id && (event.data.customerId || event.data.subscriptionId || event.data.plan)) {
        await (tx as any).company.update({
          where: { id: company.id },
          data: {
            dodoCustomerId: event.data.customerId,
            dodoSubscriptionId: event.data.subscriptionId,
            planTier: event.data.plan,
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
    companyId: event.data.companyId ?? "unknown",
    status,
    subscriptionId: event.data.subscriptionId,
    customerId: event.data.customerId,
    plan: event.data.plan,
    processed: true,
  };
}
