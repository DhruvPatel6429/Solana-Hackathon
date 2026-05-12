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
const MAX_ATTEMPTS = 3;

function dodoApiKey(): string {
  const apiKey = process.env.DODO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("[dodo] DODO_API_KEY is required for billing API calls.");
  }
  return apiKey;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function normalizeCheckoutResponse(payload: any): DodoCheckoutResponse {
  const checkoutUrl = payload.checkoutUrl ?? payload.checkout_url ?? payload.url;
  const customerId = payload.customerId ?? payload.customer_id ?? payload.customer?.id ?? "";
  const subscriptionId =
    payload.subscriptionId ?? payload.subscription_id ?? payload.subscription?.id ?? "";

  if (!checkoutUrl || typeof checkoutUrl !== "string") {
    throw new Error("[dodo] Checkout response did not include a checkout URL.");
  }

  return {
    checkoutUrl,
    customerId: String(customerId),
    subscriptionId: String(subscriptionId),
  };
}

function normalizeUsageResponse(payload: any): DodoUsageResponse {
  const usageEventId = payload.usageEventId ?? payload.usage_event_id ?? payload.id;

  if (!usageEventId || typeof usageEventId !== "string") {
    throw new Error("[dodo] Usage response did not include an event id.");
  }

  return {
    success: payload.success !== false,
    usageEventId,
  };
}

async function dodoFetch<T>(
  path: string,
  body: unknown,
  normalize: (payload: unknown) => T,
): Promise<T> {
  const apiKey = dodoApiKey();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${DODO_API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const details =
          typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.message === "string"
              ? payload.message
              : response.statusText;
        lastError = new Error(`[dodo] API request failed with ${response.status}: ${details}`);

        if (attempt < MAX_ATTEMPTS && shouldRetry(response.status)) {
          await sleep(250 * attempt);
          continue;
        }

        throw lastError;
      }

      return normalize(payload);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_ATTEMPTS) {
        await sleep(250 * attempt);
        continue;
      }
    }
  }

  throw lastError ?? new Error("[dodo] API request failed.");
}

export async function createDodoCheckout(input: DodoCheckoutRequest): Promise<DodoCheckoutResponse> {
  return dodoFetch(
    "/v1/checkout/sessions",
    {
      customer_reference_id: input.companyId,
      plan: input.tier,
      success_url: input.successUrl,
    },
    normalizeCheckoutResponse,
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
    normalizeUsageResponse,
  );
}
