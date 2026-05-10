import { createHmac, timingSafeEqual } from "node:crypto";

export type DodoWebhookEvent = {
  id: string;
  type:
    | "subscription.created"
    | "subscription.updated"
    | "subscription.cancelled"
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
    status?: string;
    plan?: string;
    amount?: number | string;
    amountUsd?: number | string;
    currency?: string;
  };
};

export function signDodoPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyDodoSignature(payload: string, signature: string | null, secret = process.env.DODO_WEBHOOK_SECRET): boolean {
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  if (!signature) {
    return false;
  }

  const expected = signDodoPayload(payload, secret);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function parseDodoWebhook(payload: string): DodoWebhookEvent {
  const parsed = JSON.parse(payload) as Partial<DodoWebhookEvent>;

  if (!parsed.id || !parsed.type || !parsed.data) {
    throw new Error("Invalid Dodo webhook payload.");
  }

  return parsed as DodoWebhookEvent;
}

export function normalizeDodoStatus(event: DodoWebhookEvent): "pending" | "paid" | "failed" | "refunded" {
  const status = event.data.status?.toLowerCase();
  if (status === "pending" || status === "paid" || status === "failed" || status === "refunded") {
    return status;
  }

  if (event.type === "payment.succeeded") return "paid";
  if (event.type === "payment.failed") return "failed";
  if (event.type === "payment.refunded") return "refunded";
  return "pending";
}
