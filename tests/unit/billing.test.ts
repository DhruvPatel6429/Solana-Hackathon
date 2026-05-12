import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createCheckoutSession, handleDodoWebhook, reconcileBillingState, reportUsageUnit } from "../../lib/services/billing.service";
import { signDodoPayload } from "../../lib/integrations/dodo/webhook";
import { installPrismaTestDb } from "../helpers/prisma-test-db";

const originalApiKey = process.env.DODO_API_KEY;
const originalSecret = process.env.DODO_WEBHOOK_SECRET;
const originalGrowthProduct = process.env.DODO_GROWTH_PRODUCT_ID;
const originalFetch = globalThis.fetch;
let restoreDb: (() => void) | undefined;

beforeEach(async () => {
  process.env.DODO_API_KEY = "dodo_test_api_key";
  process.env.DODO_GROWTH_PRODUCT_ID = "pdt_growth_test";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/checkouts/cks_growth_test")) {
      return new Response(
        JSON.stringify({
          id: "cks_growth_test",
          payment_id: "pay_growth_test",
          payment_status: "succeeded",
          customer_email: "buyer@example.com",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/checkouts")) {
      return new Response(
        JSON.stringify({
          checkout_url: "https://billing.example/checkout?checkout=growth",
          session_id: "cks_growth_test",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/events/ingest")) {
      return new Response(
        JSON.stringify({
          ingested_count: 1,
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
    data: { id: "company_demo_01", name: "Demo Billing Co", dodoCustomerId: "cus_demo_01" },
  });
});

afterEach(() => {
  restoreDb?.();
  restoreDb = undefined;
  process.env.DODO_API_KEY = originalApiKey;
  process.env.DODO_WEBHOOK_SECRET = originalSecret;
  process.env.DODO_GROWTH_PRODUCT_ID = originalGrowthProduct;
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
    assert.equal(checkout.customerId, "cus_demo_01");
    assert.equal(checkout.subscriptionId, "");
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

  test("syncs a successful Dodo checkout return before subscription webhook arrives", async () => {
    await createCheckoutSession({
      companyId: "company_demo_01",
      tier: "Growth",
      origin: "http://localhost:3000",
    });

    const reconciliation = await reconcileBillingState("company_demo_01", {
      checkout: "growth",
      session_id: "cks_growth_test",
    });

    assert.equal(reconciliation.status, "active");
    assert.equal(reconciliation.planTier, "Growth");
    assert.equal(reconciliation.paymentId, "pay_growth_test");
    assert.equal(reconciliation.checkoutSessionId, "cks_growth_test");
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
      status: "active",
      plan: "growth",
      processed: true,
    });
  });
});
