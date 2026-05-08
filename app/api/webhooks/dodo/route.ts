export async function POST(request: Request) {
  const { handleDodoWebhook } = await import("@/lib/services/billing.service");
  const payload = await request.text();
  const signature = request.headers.get("dodo-signature");

  try {
    const accountUpdate = handleDodoWebhook({ payload, signature });
    return Response.json({ received: true, accountUpdate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Dodo webhook.";
    return Response.json({ received: false, error: message }, { status: 400 });
  }
}
