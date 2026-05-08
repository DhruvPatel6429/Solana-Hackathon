import { invoices } from "@/lib/mock-data";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL || !request.headers.get("authorization")) {
    return Response.json(invoices);
  }

  try {
    const { requireTenantContext } = await import("@/lib/auth/server");
    const { listInvoicesByCompany } = await import("@/lib/db/queries/invoices");
    const tenant = await requireTenantContext(request);
    const rows = await listInvoicesByCompany(tenant.companyId);
    return Response.json(rows);
  } catch (error) {
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    return toHttpErrorResponse(error);
  }
}
