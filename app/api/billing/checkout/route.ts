export async function POST(request: Request) {
  const { createCheckoutSession } = await import("@/lib/services/billing.service");
  const body = await request.json().catch(() => ({ tier: "growth", companyId: "company_demo_01" }));
  const tier = typeof body.tier === "string" ? body.tier : "growth";
  const companyId = typeof body.companyId === "string" ? body.companyId : "company_demo_01";
  const origin = request.headers.get("origin") ?? undefined;
  const checkout = await createCheckoutSession({ companyId, tier, origin });

  return Response.json(checkout);
}
