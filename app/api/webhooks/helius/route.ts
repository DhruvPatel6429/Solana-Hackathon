import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { processHeliusTreasuryWebhook, verifyHeliusWebhook } =
    await import("@/lib/services/treasury.service");

  const { assertWebhookFreshness } =
    await import("@/lib/security/api-protection");

  const { getRequestId, logger, jsonWithRequestId } =
    await import("@/lib/utils/logger");

  const { webhookRecoveryService } =
    await import("@/lib/services/webhook-recovery.service");

  const requestId = getRequestId(request);

  let payload: unknown = null;

  try {
    // Debug incoming headers
    const headers = Object.fromEntries(request.headers.entries());

    logger.info("Helius webhook received", {
      requestId,
      provider: "helius",
      headers,
      authorizationHeader: request.headers.get("authorization"),
      expectedAuthorization: process.env.HELIUS_WEBHOOK_SECRET,
    });

    // Security checks
    assertWebhookFreshness(request);

    verifyHeliusWebhook(request);

    // Parse payload AFTER verification
    payload = await request.json();

    logger.info("Helius webhook payload parsed", {
      requestId,
      provider: "helius",
      payload,
    });

    // Process treasury updates
    const processed = await processHeliusTreasuryWebhook(payload);

    logger.info("Helius webhook processed", {
      requestId,
      provider: "helius",
      processedCount: processed.length,
      processed,
    });

    return jsonWithRequestId(
      {
        received: true,
        processedCount: processed.length,
        processed,
      },
      {},
      requestId
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Invalid Helius webhook.";

    await webhookRecoveryService
      .recordFailure({
        provider: "helius",
        externalId: request.headers.get("helius-event-id"),
        signature: request.headers.get("x-helius-signature"),
        payload: payload ?? {},
        error,
        correlationId: requestId,
      })
      .catch(() => undefined);

    logger.error("Helius webhook failed", {
      requestId,
      provider: "helius",
      error: message,
      authorizationHeader: request.headers.get("authorization"),
      expectedAuthorization: process.env.HELIUS_WEBHOOK_SECRET,
    });

    return jsonWithRequestId(
      {
        received: false,
        error: message,
      },
      { status: 400 },
      requestId
    );
  }
}