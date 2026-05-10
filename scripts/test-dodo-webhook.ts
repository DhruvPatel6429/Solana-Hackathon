import "dotenv/config";

import {
  assertCondition,
  buildReport,
  fetchJsonWithTimeout,
  printReport,
  requiredEnv,
  runCheck,
  webhookUrlsFromEnv,
  writeJsonArtifact,
} from "./phase4-common";

import { signDodoPayload } from "../lib/integrations/dodo/webhook";
import { prisma } from "../lib/db/prisma";

const db = prisma as any;

async function main(): Promise<void> {
  const checks = [] as Awaited<ReturnType<typeof buildReport>>["checks"];

  const runId = `dodo_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const companyId = `company_${runId}`;
  const eventId = `evt_${runId}`;
  const paymentId = `pay_${runId}`;

  const dodoSecret = requiredEnv("DODO_WEBHOOK_SECRET");
  const dodoUrl = webhookUrlsFromEnv().dodo;

  const payload = JSON.stringify({
    id: eventId,
    type: "payment.succeeded",
    data: {
      dodoPaymentId: paymentId,
      paymentId,
      companyId,
      customerId: `cus_${runId}`,
      subscriptionId: `sub_${runId}`,
      customerEmail: `${runId}@example.com`,
      amountUsd: "49.00",
      currency: "USD",
      plan: "growth",
      status: "paid",
    },
  });

  const signature = signDodoPayload(payload, dodoSecret);

  await runCheck(checks, "Seed company for Dodo billing persistence", async () => {
    await db.company.create({
      data: {
        id: companyId,
        name: `Phase4 Dodo Company ${runId}`,
      },
    });

    return { companyId };
  });

  await runCheck(checks, "Reject invalid Dodo signature", async () => {
    const invalid = await fetchJsonWithTimeout(
      dodoUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "dodo-signature": "00",
          "dodo-event-id": `${eventId}-invalid`,
          "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "x-webhook-nonce": `nonce-${runId}-invalid`,
        },
        body: payload,
      },
      20_000,
    );

    assertCondition(invalid.status >= 400, `Invalid signature request expected >=400, got ${invalid.status}.`);

    return {
      status: invalid.status,
      body: invalid.json ?? invalid.text,
    };
  });

  let firstResponse: { status: number; body: unknown } | null = null;

  await runCheck(checks, "Send signed Dodo webhook payload", async () => {
    const first = await fetchJsonWithTimeout(
      dodoUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "dodo-signature": signature,
          "dodo-event-id": eventId,
          "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "x-webhook-nonce": `nonce-${runId}-1`,
        },
        body: payload,
      },
      20_000,
    );

    assertCondition(first.status >= 200 && first.status < 300, `Signed Dodo webhook failed with ${first.status}. Body=${first.text}`);

    firstResponse = {
      status: first.status,
      body: first.json ?? first.text,
    };

    return firstResponse as Record<string, unknown>;
  });

  await runCheck(checks, "Verify DB persistence after first delivery", async () => {
    const [webhookEvent, billingEvent] = await Promise.all([
      db.webhookEvent.findUnique({
        where: {
          provider_externalId: {
            provider: "dodo",
            externalId: eventId,
          },
        },
      }),
      db.billingEvent.findUnique({ where: { dodoPaymentId: paymentId } }),
    ]);

    assertCondition(Boolean(webhookEvent), `WebhookEvent missing for event ${eventId}.`);
    assertCondition(Boolean(billingEvent), `BillingEvent missing for payment ${paymentId}.`);
    assertCondition(webhookEvent.processed === true, `WebhookEvent ${eventId} not marked processed.`);

    return {
      webhookEventId: webhookEvent.id,
      billingEventId: billingEvent.id,
      status: billingEvent.status,
    };
  });

  let replayResponse: { status: number; body: unknown } | null = null;

  await runCheck(checks, "Replay same webhook for idempotency", async () => {
    const replay = await fetchJsonWithTimeout(
      dodoUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "dodo-signature": signature,
          "dodo-event-id": eventId,
          "x-webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
          "x-webhook-nonce": `nonce-${runId}-2`,
        },
        body: payload,
      },
      20_000,
    );

    assertCondition(replay.status >= 200 && replay.status < 300, `Replay request failed with ${replay.status}. Body=${replay.text}`);

    replayResponse = {
      status: replay.status,
      body: replay.json ?? replay.text,
    };

    const [webhookCount, billingCount] = await Promise.all([
      db.webhookEvent.count({
        where: {
          provider: "dodo",
          externalId: eventId,
        },
      }),
      db.billingEvent.count({
        where: {
          dodoPaymentId: paymentId,
        },
      }),
    ]);

    assertCondition(webhookCount === 1, `Duplicate webhook rows detected for ${eventId}: ${webhookCount}`);
    assertCondition(billingCount === 1, `Duplicate billing rows detected for ${paymentId}: ${billingCount}`);

    return {
      replayStatus: replay.status,
      webhookCount,
      billingCount,
    };
  });

  const report = buildReport("test-dodo-webhook", checks);

  await writeJsonArtifact("artifacts/dodo-webhook-validation.json", {
    ...report,
    runId,
    endpoint: dodoUrl,
    companyId,
    eventId,
    paymentId,
    firstResponse,
    replayResponse,
  });

  printReport(report);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[phase4] test-dodo-webhook failed: ${message}`);
  process.exitCode = 1;
});
