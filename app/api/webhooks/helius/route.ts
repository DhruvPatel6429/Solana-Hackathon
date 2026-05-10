export async function POST(request: Request) {
  const { processHeliusTreasuryWebhook, verifyHeliusWebhook } = await import("@/lib/services/treasury.service");
  const { assertWebhookFreshness } = await import("@/lib/security/api-protection");
  const { getRequestId, logger, jsonWithRequestId } = await import("@/lib/utils/logger");
  const { webhookRecoveryService } = await import("@/lib/services/webhook-recovery.service");
  const requestId = getRequestId(request);
  let payload: unknown = null;

  try {
    assertWebhookFreshness(request);
    verifyHeliusWebhook(request);
    payload = await request.json();
    const processed = await processHeliusTreasuryWebhook(payload);

    logger.info("Helius webhook processed", {
      requestId,
      provider: "helius",
      processedCount: processed.length,
    });
    return jsonWithRequestId({
      received: true,
      processedCount: processed.length,
      processed,
    }, {}, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Helius webhook.";
    await webhookRecoveryService.recordFailure({
      provider: "helius",
      externalId: request.headers.get("helius-event-id"),
      signature: request.headers.get("x-helius-signature"),
      payload: payload ?? {},
      error,
      correlationId: requestId,
    }).catch(() => undefined);
    logger.error("Helius webhook failed", { requestId, error: message, provider: "helius" });
    return jsonWithRequestId({ received: false, error: message }, { status: 400 }, requestId);
  }
}
