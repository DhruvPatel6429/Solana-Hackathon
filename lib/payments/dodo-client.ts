import { logger } from "@/lib/utils/logger";

export type DodoCheckoutSessionRequest = {
  productId: string;
  customerId?: string | null;
  customer?: {
    email?: string | null;
    name?: string | null;
  };
  returnUrl: string;
  cancelUrl?: string;
  metadata?: Record<string, string | null | undefined>;
};

export type DodoCheckoutSession = {
  sessionId: string;
  checkoutUrl: string;
};

export type DodoCheckoutSessionStatus = {
  sessionId: string;
  paymentId?: string | null;
  paymentStatus?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  createdAt?: string | null;
  raw: unknown;
};

export type DodoSubscription = {
  subscriptionId: string;
  customerId?: string | null;
  productId?: string | null;
  status: string;
  currency?: string | null;
  nextBillingDate?: string | null;
  cancelledAt?: string | null;
  raw: unknown;
};

export type DodoCustomer = {
  customerId: string;
  email?: string | null;
  name?: string | null;
  raw: unknown;
};

export type DodoUsageEvent = {
  eventId: string;
  customerId: string;
  eventName: string;
  timestamp?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type DodoUsageResponse = {
  ingestedCount: number;
};

export type DodoPortalSession = {
  link: string;
};

const MAX_ATTEMPTS = 3;

function getDodoApiKey(): string {
  const apiKey = process.env.DODO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("[dodo] DODO_API_KEY is required for billing API calls.");
  }
  return apiKey;
}

export function getDodoBaseUrl(): string {
  return (
    process.env.DODO_BASE_URL?.trim() ||
    process.env.DODO_API_BASE_URL?.trim() ||
    "https://test.dodopayments.com"
  ).replace(/\/+$/, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function errorMessage(payload: any, fallback: string): string {
  return (
    (typeof payload?.error === "string" && payload.error) ||
    (typeof payload?.message === "string" && payload.message) ||
    fallback
  );
}

async function dodoRequest<T>(
  path: string,
  init: RequestInit,
  normalize: (payload: unknown) => T,
): Promise<T> {
  const url = `${getDodoBaseUrl()}${path}`;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${getDodoApiKey()}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      const payload = await parseJson(response);

      if (!response.ok) {
        lastError = new Error(`[dodo] API request failed with ${response.status}: ${errorMessage(payload, response.statusText)}`);
        logger.warn("Dodo API request failed", { path, status: response.status, attempt });
        if (attempt < MAX_ATTEMPTS && shouldRetry(response.status)) {
          await sleep(300 * attempt);
          continue;
        }
        throw lastError;
      }

      return normalize(payload);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_ATTEMPTS) {
        await sleep(300 * attempt);
        continue;
      }
    }
  }

  throw lastError ?? new Error("[dodo] API request failed.");
}

function normalizeCheckout(payload: any): DodoCheckoutSession {
  const checkoutUrl = payload.checkout_url ?? payload.checkoutUrl ?? payload.payment_link ?? payload.url;
  const sessionId = payload.session_id ?? payload.sessionId ?? payload.checkout_session_id ?? "";
  if (!checkoutUrl || typeof checkoutUrl !== "string") {
    throw new Error("[dodo] Checkout response did not include checkout_url.");
  }
  return { sessionId: String(sessionId), checkoutUrl };
}

function normalizeCheckoutStatus(payload: any): DodoCheckoutSessionStatus {
  const sessionId = payload.id ?? payload.session_id ?? payload.sessionId;
  if (!sessionId) {
    throw new Error("[dodo] Checkout session response did not include id.");
  }
  return {
    sessionId: String(sessionId),
    paymentId: payload.payment_id ?? payload.paymentId ?? null,
    paymentStatus: payload.payment_status ?? payload.paymentStatus ?? null,
    customerEmail: payload.customer_email ?? payload.customerEmail ?? null,
    customerName: payload.customer_name ?? payload.customerName ?? null,
    createdAt: payload.created_at ?? payload.createdAt ?? null,
    raw: payload,
  };
}

function normalizeSubscription(payload: any): DodoSubscription {
  const subscriptionId = payload.subscription_id ?? payload.subscriptionId ?? payload.id;
  if (!subscriptionId) {
    throw new Error("[dodo] Subscription response did not include subscription_id.");
  }
  return {
    subscriptionId: String(subscriptionId),
    customerId: payload.customer?.customer_id ?? payload.customer_id ?? payload.customerId ?? null,
    productId: payload.product_id ?? payload.productId ?? null,
    status: String(payload.status ?? "pending"),
    currency: payload.currency ?? null,
    nextBillingDate: payload.next_billing_date ?? payload.nextBillingDate ?? null,
    cancelledAt: payload.cancelled_at ?? payload.cancelledAt ?? null,
    raw: payload,
  };
}

function normalizeCustomer(payload: any): DodoCustomer {
  const customerId = payload.customer_id ?? payload.customerId ?? payload.id;
  if (!customerId) {
    throw new Error("[dodo] Customer response did not include customer_id.");
  }
  return {
    customerId: String(customerId),
    email: payload.email ?? null,
    name: payload.name ?? null,
    raw: payload,
  };
}

export async function createHostedCheckout(input: DodoCheckoutSessionRequest): Promise<DodoCheckoutSession> {
  const customer = input.customerId
    ? { customer_id: input.customerId }
    : input.customer?.email
      ? {
          email: input.customer.email,
          name: input.customer?.name ?? undefined,
        }
      : undefined;

  return dodoRequest(
    "/checkouts",
    {
      method: "POST",
      body: JSON.stringify({
        product_cart: [{ product_id: input.productId, quantity: 1 }],
        ...(customer ? { customer } : {}),
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        metadata: input.metadata ?? {},
      }),
    },
    normalizeCheckout,
  );
}

export async function fetchDodoSubscription(subscriptionId: string): Promise<DodoSubscription> {
  return dodoRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" }, normalizeSubscription);
}

export async function fetchDodoCheckoutSession(sessionId: string): Promise<DodoCheckoutSessionStatus> {
  return dodoRequest(`/checkouts/${encodeURIComponent(sessionId)}`, { method: "GET" }, normalizeCheckoutStatus);
}

export async function fetchDodoCustomer(customerId: string): Promise<DodoCustomer> {
  return dodoRequest(`/customers/${encodeURIComponent(customerId)}`, { method: "GET" }, normalizeCustomer);
}

export async function reportDodoUsageEvents(events: DodoUsageEvent[]): Promise<DodoUsageResponse> {
  return dodoRequest(
    "/events/ingest",
    {
      method: "POST",
      body: JSON.stringify({
        events: events.map((event) => ({
          event_id: event.eventId,
          customer_id: event.customerId,
          event_name: event.eventName,
          timestamp: event.timestamp,
          metadata: event.metadata,
        })),
      }),
    },
    (payload: any) => ({ ingestedCount: Number(payload.ingested_count ?? payload.ingestedCount ?? 0) }),
  );
}

export async function createDodoPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl?: string;
}): Promise<DodoPortalSession> {
  const query = new URLSearchParams();
  if (returnUrl) query.set("return_url", returnUrl);
  return dodoRequest(
    `/customers/${encodeURIComponent(customerId)}/customer-portal/session${query.size ? `?${query}` : ""}`,
    { method: "POST", body: JSON.stringify({}) },
    (payload: any) => {
      const link = payload.link ?? payload.url;
      if (!link || typeof link !== "string") {
        throw new Error("[dodo] Portal response did not include link.");
      }
      return { link };
    },
  );
}
