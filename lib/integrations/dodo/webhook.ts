import { createHmac, timingSafeEqual } from "node:crypto";

export type DodoWebhookEvent = {
  id: string;
  type: "subscription.created" | "subscription.updated" | "subscription.cancelled" | "payment.succeeded" | "usage.recorded";
  data: {
    companyId?: string;
    customerId?: string;
    subscriptionId?: string;
    status?: string;
    plan?: string;
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
