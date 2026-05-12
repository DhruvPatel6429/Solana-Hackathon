import { createHmac, timingSafeEqual } from "node:crypto";

export type DodoWebhookEvent = {
  id: string;
  type:
    | "subscription.created"
    | "subscription.active"
    | "subscription.updated"
    | "subscription.cancelled"
    | "subscription.failed"
    | "subscription.on_hold"
    | "subscription.renewed"
    | "payment.pending"
    | "payment.succeeded"
    | "payment.failed"
    | "payment.refunded"
    | "usage.recorded";
  data: {
    id?: string;
    paymentId?: string;
    dodoPaymentId?: string;
    companyId?: string;
    customerId?: string;
    customerEmail?: string;
    subscriptionId?: string;
    subscription_id?: string;
    status?: string;
    plan?: string;
    productId?: string;
    product_id?: string;
    amount?: number | string;
    amountUsd?: number | string;
    currency?: string;
  };
};

export function signDodoPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function safeEqualHex(expected: string, received: string): boolean {
  try {
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(received, "hex");
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

function parseStandardWebhookSignature(signature: string): string[] {
  return signature
    .split(" ")
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [, value] = part.split("=");
      return value ?? part;
    });
}

export function signDodoStandardPayload({
  payload,
  secret,
  webhookId,
  timestamp,
}: {
  payload: string;
  secret: string;
  webhookId: string;
  timestamp: string;
}): string {
  return createHmac("sha256", secret).update(`${webhookId}.${timestamp}.${payload}`, "utf8").digest("hex");
}

export function verifyDodoSignature(
  payload: string,
  signature: string | null,
  secret = process.env.DODO_WEBHOOK_SECRET,
  headers?: { webhookId?: string | null; webhookTimestamp?: string | null },
): boolean {
  if (!secret) {
    return false;
  }

  if (!signature) {
    return false;
  }

  if (headers?.webhookId && headers.webhookTimestamp) {
    const expected = signDodoStandardPayload({
      payload,
      secret,
      webhookId: headers.webhookId,
      timestamp: headers.webhookTimestamp,
    });
    return parseStandardWebhookSignature(signature).some((received) => safeEqualHex(expected, received));
  }

  const expected = signDodoPayload(payload, secret);
  return safeEqualHex(expected, signature);
}

export function parseDodoWebhook(payload: string): DodoWebhookEvent {
  const parsed = JSON.parse(payload) as Partial<DodoWebhookEvent>;

  if (!parsed.id || !parsed.type || !parsed.data) {
    throw new Error("Invalid Dodo webhook payload.");
  }

  return parsed as DodoWebhookEvent;
}

export function normalizeDodoStatus(event: DodoWebhookEvent): "pending" | "active" | "trialing" | "paid" | "failed" | "refunded" | "cancelled" {
  const status = event.data.status?.toLowerCase();
  if (status === "pending" || status === "paid" || status === "failed" || status === "refunded" || status === "active" || status === "trialing" || status === "cancelled") {
    return status;
  }

  if (event.type === "subscription.active" || event.type === "subscription.updated" || event.type === "subscription.renewed") return "active";
  if (event.type === "subscription.cancelled") return "cancelled";
  if (event.type === "subscription.failed" || event.type === "subscription.on_hold") return "failed";
  if (event.type === "payment.succeeded") return "paid";
  if (event.type === "payment.failed") return "failed";
  if (event.type === "payment.refunded") return "refunded";
  return "pending";
}
