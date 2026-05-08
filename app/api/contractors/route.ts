import { contractors } from "@/lib/mock-data";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL || !request.headers.get("authorization")) {
    return Response.json(contractors);
  }

  try {
    const { requireTenantContext } = await import("@/lib/auth/server");
    const { listContractorsByCompany } = await import("@/lib/db/queries/contractors");
    const tenant = await requireTenantContext(request);
    const rows = await listContractorsByCompany(tenant.companyId);
    return Response.json(rows);
  } catch (error) {
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    return toHttpErrorResponse(error);
  }
}
