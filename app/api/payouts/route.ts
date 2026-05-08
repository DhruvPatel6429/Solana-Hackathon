import { toHttpErrorResponse } from "@/lib/auth/http";
import { requireTenantContext } from "@/lib/auth/server";
import { listPayoutsByCompany, type PayoutListFilters } from "@/lib/db/queries/payouts";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContext(request);
    const url = new URL(request.url);

    const filters: PayoutListFilters = {
      search: url.searchParams.get("search") ?? undefined,
      from: parseDate(url.searchParams.get("from")),
      to: parseDate(url.searchParams.get("to")),
      kycStatus:
        (url.searchParams.get("kycStatus") as PayoutListFilters["kycStatus"]) ??
        undefined,
    };

    const rows = await listPayoutsByCompany(tenant.companyId, filters);
    return Response.json(rows);
  } catch (error) {
    return toHttpErrorResponse(error);
  }
}
