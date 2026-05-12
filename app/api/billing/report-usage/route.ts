export async function POST(request: Request) {
  try {
    const { requireTenantContext } = await import("@/lib/auth/server");
    const { reportUsageUnit } = await import("@/lib/services/billing.service");
    const tenant = await requireTenantContext(request);
    const body = await request.json().catch(() => ({ eventType: "payout" }));
    const allowed = ["invoice", "payout", "fx_quote", "payroll_run", "contractor_count", "invoice_volume", "treasury_operation"];
    const eventType = allowed.includes(body.eventType) ? body.eventType : "payout";
    const referenceId = typeof body.referenceId === "string" ? body.referenceId : undefined;
    const result = await reportUsageUnit({ companyId: tenant.companyId, eventType, referenceId });

    return Response.json(result);
  } catch (error) {
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    return toHttpErrorResponse(error);
  }
}
