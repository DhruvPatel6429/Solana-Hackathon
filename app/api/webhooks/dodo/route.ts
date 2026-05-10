export async function POST(request: Request) {
  const { handleDodoWebhook } = await import("@/lib/services/billing.service");
  const { assertWebhookFreshness } = await import("@/lib/security/api-protection");
  const { getRequestId, logger, jsonWithRequestId } = await import("@/lib/utils/logger");
  const { webhookRecoveryService } = await import("@/lib/services/webhook-recovery.service");
  const requestId = getRequestId(request);
  const payload = await request.text();
  const signature = request.headers.get("dodo-signature");
  const externalId = request.headers.get("dodo-event-id") ?? undefined;
  const safePayload = () => {
    try {
      return JSON.parse(payload || "{}");
    } catch {
      return { raw: payload };
    }
  };

  try {
    const freshness = assertWebhookFreshness(request);
    const accountUpdate = await handleDodoWebhook({ payload, signature });
    logger.info("Dodo webhook processed", {
      requestId,
      webhookId: accountUpdate.eventId,
      provider: "dodo",
      nonce: freshness.nonce,
    });
    return jsonWithRequestId({ received: true, accountUpdate }, {}, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Dodo webhook.";
    await webhookRecoveryService.recordFailure({
      provider: "dodo",
      externalId,
      signature,
      payload: safePayload(),
      error,
      correlationId: requestId,
    }).catch(() => undefined);
    logger.error("Dodo webhook failed", { requestId, error: message, provider: "dodo" });
    return jsonWithRequestId({ received: false, error: message }, { status: 400 }, requestId);
  }
}
