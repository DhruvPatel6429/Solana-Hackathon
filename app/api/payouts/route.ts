import { payouts } from "@/lib/mock-data";

type PayoutListFilters = {
  search?: string;
  from?: Date;
  to?: Date;
  kycStatus?: "Verified" | "Pending" | "Rejected";
};

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseFilters(request: Request): PayoutListFilters {
  const url = new URL(request.url);
  return {
    search: url.searchParams.get("search") ?? undefined,
    from: parseDate(url.searchParams.get("from")),
    to: parseDate(url.searchParams.get("to")),
    kycStatus: (url.searchParams.get("kycStatus") as PayoutListFilters["kycStatus"]) ?? undefined,
  };
}

export async function GET(request: Request) {
  const filters = parseFilters(request);

  if (!request.headers.get("authorization")) {
    const { AuthenticationError } = await import("@/lib/auth/server");
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    return toHttpErrorResponse(
      new AuthenticationError("Missing Authorization header."),
    );
  }

  if (!process.env.DATABASE_URL) {
    const query = filters.search?.trim().toLowerCase();
    const rows = payouts.filter((payout) => {
      if (filters.kycStatus && payout.kycStatus !== filters.kycStatus) return false;
      if (query && !`${payout.contractor} ${payout.invoiceId} ${payout.txHash}`.toLowerCase().includes(query)) return false;
      return true;
    });
    return Response.json(rows);
  }

  try {
    const { requireTenantContext } = await import("@/lib/auth/server");
    const { listPayoutsByCompany } = await import("@/lib/db/queries/payouts");
    const tenant = await requireTenantContext(request);
    const rows = await listPayoutsByCompany(tenant.companyId, filters);
    return Response.json(rows);
  } catch (error) {
    const { toHttpErrorResponse } = await import("@/lib/auth/http");
    return toHttpErrorResponse(error);
  }
}
