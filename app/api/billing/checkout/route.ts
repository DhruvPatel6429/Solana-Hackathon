import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { createCheckoutSession } from "@/lib/services/billing.service";

export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext(request);
    const body = await request.json().catch(() => ({ selectedPlan: "growth" }));
    const tier =
      typeof body.selectedPlan === "string"
        ? body.selectedPlan
        : typeof body.tier === "string"
          ? body.tier
          : "growth";
    const origin = request.headers.get("origin") ?? undefined;
    const checkout = await createCheckoutSession({
      companyId: tenant.companyId,
      tier,
      origin,
    });

    return Response.json({ ...checkout, redirectUrl: checkout.url });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[dodo]")) {
      return Response.json(
        {
          error: "Unable to create billing checkout.",
          details: error.message,
        },
        { status: 502 },
      );
    }

    return toHttpErrorResponse(error);
  }
}
