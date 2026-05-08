type DodoCheckoutRequest = {
  companyId: string;
  tier: string;
  successUrl?: string;
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

const DODO_API_BASE_URL = process.env.DODO_API_BASE_URL ?? "https://api.dodopayments.com";

function mockCheckout(tier: string): DodoCheckoutResponse {
  const normalizedTier = tier.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return {
    checkoutUrl: `/onboarding?checkout=${normalizedTier}&provider=dodo`,
    customerId: `dodo_cus_demo_${normalizedTier}`,
    subscriptionId: `dodo_sub_demo_${normalizedTier}`,
  };
}

function mockUsage(referenceId?: string): DodoUsageResponse {
  return {
    success: true,
    usageEventId: `dodo_usage_${referenceId ?? "demo"}_${Date.now()}`,
  };
}

async function dodoFetch<T>(path: string, body: unknown, mock: T): Promise<T> {
  const apiKey = process.env.DODO_API_KEY;

  if (!apiKey) {
    return mock;
  }

  const response = await fetch(`${DODO_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Dodo API request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function createDodoCheckout(input: DodoCheckoutRequest): Promise<DodoCheckoutResponse> {
  return dodoFetch(
    "/v1/checkout/sessions",
    {
      customer_reference_id: input.companyId,
      plan: input.tier,
      success_url: input.successUrl,
    },
    mockCheckout(input.tier),
  );
}

export async function reportDodoUsage(input: DodoUsageRequest): Promise<DodoUsageResponse> {
  return dodoFetch(
    "/v1/usage/events",
    {
      customer_reference_id: input.companyId,
      event_type: input.eventType,
      units: input.units ?? 1,
      reference_id: input.referenceId,
    },
    mockUsage(input.referenceId),
  );
}
