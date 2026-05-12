import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createCheckoutSession, handleDodoWebhook, reportUsageUnit } from "../../lib/services/billing.service";
import { signDodoPayload } from "../../lib/integrations/dodo/webhook";
import { installPrismaTestDb } from "../helpers/prisma-test-db";

const originalApiKey = process.env.DODO_API_KEY;
const originalSecret = process.env.DODO_WEBHOOK_SECRET;
const originalFetch = globalThis.fetch;
let restoreDb: (() => void) | undefined;

beforeEach(async () => {
  process.env.DODO_API_KEY = "dodo_test_api_key";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/v1/checkout/sessions")) {
      return new Response(
        JSON.stringify({
          checkoutUrl: "https://billing.example/checkout?checkout=growth",
          customerId: "dodo_cus_demo_growth",
          subscriptionId: "dodo_sub_demo_growth",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/v1/usage/events")) {
      return new Response(
        JSON.stringify({
          success: true,
          usageEventId: "usage_tx_demo_001",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "not mocked" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const installed = await installPrismaTestDb();
  restoreDb = installed.restore;
  await installed.prisma.company.create({
    data: { id: "company_demo_01", name: "Demo Billing Co" },
  });
});

afterEach(() => {
  restoreDb?.();
  restoreDb = undefined;
  process.env.DODO_API_KEY = originalApiKey;
  process.env.DODO_WEBHOOK_SECRET = originalSecret;
  globalThis.fetch = originalFetch;
});

describe("Dodo billing service", () => {
  test("creates a hosted checkout URL without requiring live Dodo credentials", async () => {
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
    const usage = await reportUsageUnit({
      companyId: "company_demo_01",
      eventType: "payout",
      referenceId: "tx_demo_001",
    });

    assert.equal(usage.success, true);
    assert.equal(usage.usageEventId.includes("tx_demo_001"), true);
  });

  test("rejects Dodo webhooks with an invalid signature", async () => {
    process.env.DODO_WEBHOOK_SECRET = "secret_test";
    const payload = JSON.stringify({
      id: "evt_bad",
      type: "payment.succeeded",
      data: { companyId: "company_demo_01", status: "active" },
    });

    await assert.rejects(() => handleDodoWebhook({ payload, signature: "00" }), /Invalid Dodo webhook signature/);
  });

  test("accepts signed Dodo webhooks and maps them to account updates", async () => {
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

    const update = await handleDodoWebhook({ payload, signature });

    assert.deepEqual(update, {
      eventId: "evt_good",
      companyId: "company_demo_01",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      status: "pending",
      plan: "growth",
      processed: true,
    });
  });
});
