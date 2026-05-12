import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { createBillingPortalSession } from "@/lib/services/billing.service";

export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext(request);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get("origin") ?? process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
    const portal = await createBillingPortalSession(tenant.companyId, `${appUrl}/dashboard`);
    return Response.json(portal);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[dodo]")) {
      return Response.json({ error: "Unable to create billing portal session.", details: error.message }, { status: 502 });
    }
    return toHttpErrorResponse(error);
  }
}
