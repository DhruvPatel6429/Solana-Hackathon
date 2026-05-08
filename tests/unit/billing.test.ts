import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { createCheckoutSession, handleDodoWebhook, reportUsageUnit } from "../../lib/services/billing.service";
import { signDodoPayload } from "../../lib/integrations/dodo/webhook";

const originalApiKey = process.env.DODO_API_KEY;
const originalSecret = process.env.DODO_WEBHOOK_SECRET;

afterEach(() => {
  process.env.DODO_API_KEY = originalApiKey;
  process.env.DODO_WEBHOOK_SECRET = originalSecret;
});

describe("Dodo billing service", () => {
  test("creates a hosted checkout URL without requiring live Dodo credentials", async () => {
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

  test("reports one usage unit for invoice, payout, or FX events", async () => {
    delete process.env.DODO_API_KEY;

    const usage = await reportUsageUnit({
      companyId: "company_demo_01",
      eventType: "payout",
      referenceId: "tx_demo_001",
    });

    assert.equal(usage.success, true);
    assert.equal(usage.usageEventId.includes("tx_demo_001"), true);
  });

  test("rejects Dodo webhooks with an invalid signature", () => {
    process.env.DODO_WEBHOOK_SECRET = "secret_test";
    const payload = JSON.stringify({
      id: "evt_bad",
      type: "payment.succeeded",
      data: { companyId: "company_demo_01", status: "active" },
    });

    assert.throws(() => handleDodoWebhook({ payload, signature: "00" }), /Invalid Dodo webhook signature/);
  });

  test("accepts signed Dodo webhooks and maps them to account updates", () => {
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
});
