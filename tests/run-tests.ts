import assert from "node:assert/strict";
import { createCheckoutSession, handleDodoWebhook, reportUsageUnit } from "../lib/services/billing.service";
import { POST as checkoutPost } from "../app/api/billing/checkout/route";
import { POST as usagePost } from "../app/api/billing/report-usage/route";
import { POST as dodoWebhookPost } from "../app/api/webhooks/dodo/route";
import { signDodoPayload } from "../lib/integrations/dodo/webhook";

const originalApiKey = process.env.DODO_API_KEY;
const originalSecret = process.env.DODO_WEBHOOK_SECRET;

function resetEnv() {
  process.env.DODO_API_KEY = originalApiKey;
  process.env.DODO_WEBHOOK_SECRET = originalSecret;
}

async function run(name: string, test: () => void | Promise<void>) {
  try {
    await test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  } finally {
    resetEnv();
  }
}

await run("Dodo checkout service returns hosted checkout metadata", async () => {
  delete process.env.DODO_API_KEY;
  const checkout = await createCheckoutSession({
    companyId: "company_demo_01",
    tier: "Growth",
    origin: "http://localhost:3000",
  });

  assert.equal(checkout.url.includes("checkout=growth"), true);
  assert.equal(checkout.customerId, "dodo_cus_demo_growth");
  assert.equal(checkout.subscriptionId, "dodo_sub_demo_growth");
});

await run("Dodo usage service records one billable unit", async () => {
  delete process.env.DODO_API_KEY;
  const usage = await reportUsageUnit({
    companyId: "company_demo_01",
    eventType: "payout",
    referenceId: "tx_demo_001",
  });

  assert.equal(usage.success, true);
  assert.equal(usage.usageEventId.includes("tx_demo_001"), true);
});

await run("Dodo webhook service rejects invalid signatures", () => {
  process.env.DODO_WEBHOOK_SECRET = "secret_test";
  const payload = JSON.stringify({
    id: "evt_bad",
    type: "payment.succeeded",
    data: { companyId: "company_demo_01", status: "active" },
  });

  assert.throws(() => handleDodoWebhook({ payload, signature: "00" }), /Invalid Dodo webhook signature/);
});

await run("Dodo webhook service maps signed events to account updates", () => {
  process.env.DODO_WEBHOOK_SECRET = "secret_test";
  const payload = JSON.stringify({
    id: "evt_good",
    type: "subscription.updated",
    data: {
      companyId: "company_demo_01",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      status: "active",
      plan: "growth",
    },
  });
  const signature = signDodoPayload(payload, "secret_test");

  const update = handleDodoWebhook({ payload, signature });

  assert.deepEqual(update, {
    eventId: "evt_good",
    companyId: "company_demo_01",
    customerId: "cus_123",
    subscriptionId: "sub_123",
    status: "active",
    plan: "growth",
  });
});

await run("Checkout API returns onboarding checkout URL", async () => {
  delete process.env.DODO_API_KEY;
  const request = new Request("http://localhost:3000/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ companyId: "company_demo_01", tier: "Growth" }),
  });

  const response = await checkoutPost(request);
  const json = (await response.json()) as { url: string; customerId: string; subscriptionId: string };

  assert.equal(response.status, 200);
  assert.equal(json.url.includes("checkout=growth"), true);
  assert.equal(json.customerId, "dodo_cus_demo_growth");
  assert.equal(json.subscriptionId, "dodo_sub_demo_growth");
});

await run("Usage API records one unit for invoice events", async () => {
  delete process.env.DODO_API_KEY;
  const request = new Request("http://localhost:3000/api/billing/report-usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: "company_demo_01", eventType: "invoice", referenceId: "INV-1001" }),
  });

  const response = await usagePost(request);
  const json = (await response.json()) as { success: boolean; usageEventId: string };

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.usageEventId.includes("INV-1001"), true);
});

await run("Dodo webhook API verifies signature and returns account update", async () => {
  process.env.DODO_WEBHOOK_SECRET = "secret_test";
  const payload = JSON.stringify({
    id: "evt_001",
    type: "payment.succeeded",
    data: { companyId: "company_demo_01", customerId: "cus_001", subscriptionId: "sub_001", status: "active" },
  });
  const request = new Request("http://localhost:3000/api/webhooks/dodo", {
    method: "POST",
    headers: { "dodo-signature": signDodoPayload(payload, "secret_test") },
    body: payload,
  });

  const response = await dodoWebhookPost(request);
  const json = (await response.json()) as { received: boolean; accountUpdate: { eventId: string; status: string } };

  assert.equal(response.status, 200);
  assert.equal(json.received, true);
  assert.equal(json.accountUpdate.eventId, "evt_001");
  assert.equal(json.accountUpdate.status, "active");
});

console.log("Member 1 billing checks passed.");
