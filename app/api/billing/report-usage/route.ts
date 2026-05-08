export async function POST(request: Request) {
  const { reportUsageUnit } = await import("@/lib/services/billing.service");
  const body = await request.json().catch(() => ({ eventType: "payout", companyId: "company_demo_01" }));
  const eventType = ["invoice", "payout", "fx_quote"].includes(body.eventType) ? body.eventType : "payout";
  const companyId = typeof body.companyId === "string" ? body.companyId : "company_demo_01";
  const referenceId = typeof body.referenceId === "string" ? body.referenceId : undefined;
  const result = await reportUsageUnit({ companyId, eventType, referenceId });

  return Response.json(result);
}
