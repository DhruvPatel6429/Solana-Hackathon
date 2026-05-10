export async function POST(request: Request) {
  const { processHeliusTreasuryWebhook, verifyHeliusWebhook } = await import("@/lib/services/treasury.service");

  try {
    verifyHeliusWebhook(request);
    const payload = await request.json();
    const processed = await processHeliusTreasuryWebhook(payload);

    return Response.json({
      received: true,
      processedCount: processed.length,
      processed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Helius webhook.";
    console.error("[api:webhooks:helius] Webhook failed", { error: message });
    return Response.json({ received: false, error: message }, { status: 400 });
  }
}
