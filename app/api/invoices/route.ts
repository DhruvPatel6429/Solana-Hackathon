import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { listInvoicesByCompany } from "@/lib/db/queries/invoices";

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContext(request);
    const rows = await listInvoicesByCompany(tenant.companyId);
    return Response.json(rows);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
