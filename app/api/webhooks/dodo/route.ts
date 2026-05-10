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
  const payloadObject = safePayload() as any;
  const payloadCompanyId =
    typeof payloadObject?.data?.companyId === "string"
      ? payloadObject.data.companyId
      : undefined;
  let payloadOrganizationId: string | undefined;
  if (payloadCompanyId) {
    const { prisma } = await import("@/lib/db/prisma");
    const db = prisma as any;
    const company = await db.company.findUnique({
      where: { id: payloadCompanyId },
      select: { organizationId: true },
    }).catch(() => null);
    payloadOrganizationId = company?.organizationId ?? undefined;
  }

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
      companyId: payloadCompanyId,
      organizationId: payloadOrganizationId,
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
