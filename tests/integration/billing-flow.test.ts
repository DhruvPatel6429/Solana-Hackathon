import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { POST as checkoutPost } from "../../app/api/billing/checkout/route";
import { POST as usagePost } from "../../app/api/billing/report-usage/route";
import { POST as dodoWebhookPost } from "../../app/api/webhooks/dodo/route";
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
          usageEventId: "usage_INV-1001",
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
  await installed.prisma.companyUser.create({
    data: {
      id: "membership_demo_01",
      companyId: "company_demo_01",
      userId: "test-admin",
      role: "admin",
    },
  });
});

afterEach(() => {
  restoreDb?.();
  restoreDb = undefined;
  process.env.DODO_API_KEY = originalApiKey;
  process.env.DODO_WEBHOOK_SECRET = originalSecret;
  globalThis.fetch = originalFetch;
});

describe("Member 1 Dodo billing API flow", () => {
  test("checkout route returns a hosted checkout URL for company onboarding", async () => {
    const request = new Request("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://localhost:3000",
        authorization: "Bearer test:test-admin",
      },
      body: JSON.stringify({ companyId: "company_demo_01", tier: "Growth" }),
    });

    const response = await checkoutPost(request);
    const json = (await response.json()) as { url: string; customerId: string; subscriptionId: string };

    assert.equal(response.status, 200);
    assert.equal(json.url.includes("checkout=growth"), true);
    assert.equal(json.customerId, "dodo_cus_demo_growth");
    assert.equal(json.subscriptionId, "dodo_sub_demo_growth");
  });

  test("usage route records one billable unit after payout or invoice events", async () => {
    const request = new Request("http://localhost:3000/api/billing/report-usage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test:test-admin",
      },
      body: JSON.stringify({ companyId: "company_demo_01", eventType: "invoice", referenceId: "INV-1001" }),
    });

    const response = await usagePost(request);
    const json = (await response.json()) as { success: boolean; usageEventId: string };

    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.usageEventId.includes("INV-1001"), true);
  });

  test("webhook route verifies signature and returns account update payload", async () => {
    process.env.DODO_WEBHOOK_SECRET = "secret_test";
    const payload = JSON.stringify({
      id: "evt_001",
      type: "payment.succeeded",
      data: { companyId: "company_demo_01", customerId: "cus_001", subscriptionId: "sub_001", status: "paid" },
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
    assert.equal(json.accountUpdate.status, "paid");
  });
});
