import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { listContractorsByCompany } from "@/lib/db/queries/contractors";

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContext(request);
    const rows = await listContractorsByCompany(tenant.companyId);
    return Response.json(rows);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
