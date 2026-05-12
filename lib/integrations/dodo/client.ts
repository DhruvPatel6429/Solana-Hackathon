import { getBillingPlan, resolveBillingPlanProductId } from "@/lib/billing/plans";
import {
  createHostedCheckout,
  reportDodoUsageEvents,
  type DodoUsageResponse as DodoIngestResponse,
} from "@/lib/payments/dodo-client";

type DodoCheckoutRequest = {
  companyId: string;
  tier: string;
  successUrl?: string;
  customerId?: string | null;
  organizationId?: string | null;
};

type DodoUsageRequest = {
  companyId: string;
  eventType: "invoice" | "payout" | "fx_quote";
  units?: number;
  referenceId?: string;
};

export type DodoCheckoutResponse = {
  checkoutUrl: string;
  customerId: string;
  subscriptionId: string;
};

export type DodoUsageResponse = {
  success: boolean;
  usageEventId: string;
};

export async function createDodoCheckout(input: DodoCheckoutRequest): Promise<DodoCheckoutResponse> {
  const plan = getBillingPlan(input.tier);
  const checkout = await createHostedCheckout({
    productId: resolveBillingPlanProductId(plan),
    customerId: input.customerId,
    returnUrl: input.successUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_ORIGIN ?? "http://localhost:3000"}/onboarding?billing_return=1`,
    metadata: {
      companyId: input.companyId,
      organizationId: input.organizationId ?? null,
      selectedPlan: plan.tier,
    },
  });

  return {
    checkoutUrl: checkout.checkoutUrl,
    customerId: input.customerId ?? "",
    subscriptionId: "",
  };
}

export async function reportDodoUsage(input: DodoUsageRequest): Promise<DodoUsageResponse> {
  const eventId = input.referenceId
    ? `${input.companyId}:${input.eventType}:${input.referenceId}`
    : `${input.companyId}:${input.eventType}:${crypto.randomUUID()}`;
  const result: DodoIngestResponse = await reportDodoUsageEvents([
    {
      eventId,
      customerId: input.companyId,
      eventName: input.eventType,
      timestamp: new Date().toISOString(),
      metadata: {
        units: input.units ?? 1,
        referenceId: input.referenceId ?? null,
      },
    },
  ]);

  return {
    success: result.ingestedCount > 0,
    usageEventId: eventId,
  };
}
